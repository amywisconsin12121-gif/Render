import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { normalizeImage, imageContent } from '../src/images.js';
import { ImageScout } from '../src/service.js';
import { CandidateCache } from '../src/cache.js';
import { parseBraveResults, parseWikimediaResults, SearchProvider } from '../src/providers.js';
import { VisionSelfTest } from '../src/self-test.js';

const config = loadConfig({ MCP_SECRET: 'test-secret-not-for-production-123456789', SEARCH_PROVIDER: 'wikimedia' });
const raster = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#e82030' } }).png().toBuffer();
const fixture = {
  originalUrl: 'https://photos.example.com/misleading-blue-cat.jpg',
  thumbnailUrl: 'https://thumbs.example.com/wrong-green-title.png',
  sourcePageUrl: 'https://example.com/misleading-caption', provider: 'wikimedia',
};

test('config creates the same private URL token as the browser SHA-256 algorithm', () => {
  assert.equal(config.mcpToken, createHash('sha256').update('test-secret-not-for-production-123456789').digest('hex'));
  assert.throws(() => loadConfig({ MCP_SECRET: 'short' }), /MCP_SECRET/);
  assert.throws(() => loadConfig({ MCP_SECRET: 'replace-with-a-random-secret-at-least-32-characters' }), /MCP_SECRET/);
  assert.throws(() => loadConfig({ MCP_SECRET: 'long-enough-secret-for-test-123456789', PUBLIC_BASE_URL: 'http://public.example.com' }), /HTTPS/);
  assert.throws(() => loadConfig({ MCP_SECRET: 'long-enough-secret-for-test-123456789', PUBLIC_BASE_URL: 'https://example.com/path' }), /origin/);
});

test('normalization delivers real image pixels with bounded dimensions and no EXIF', async () => {
  const withExif = await sharp(raster).withMetadata({ exif: { IFD0: { ImageDescription: 'Misleading metadata must be stripped' } } }).jpeg().toBuffer();
  assert.ok((await sharp(withExif).metadata()).exif);
  const image = await normalizeImage(withExif);
  assert.equal(image.width, 768);
  assert.equal(image.height, 512);
  assert.ok(image.buffer.length < 350000);
  const block = imageContent(image);
  assert.equal(block.type, 'image');
  assert.equal(block.mimeType, 'image/jpeg');
  const pixels = await sharp(Buffer.from(block.data, 'base64')).raw().toBuffer();
  assert.ok(pixels[0] > 200 && pixels[1] < 60 && pixels[2] < 80, 'Red image pixels survived decoding.');
  assert.equal((await sharp(image.buffer).metadata()).exif, undefined);
  await assert.rejects(normalizeImage(Buffer.from('<html>Not an image</html>')));
  await assert.rejects(normalizeImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')), /raster/);
});

test('search supplies pixels while withholding source URL, title, tags, and filenames', async () => {
  const downloads = [];
  const scout = new ImageScout(config, {
    provider: { search: async () => [{ ...fixture, title: 'misleading-caption' }] },
    download: async url => { downloads.push(url); return { buffer: raster }; },
  });
  const result = await scout.search({ query: 'red rectangle', count: 1 });
  assert.equal(result.content.filter(item => item.type === 'image').length, 1);
  const text = result.content.filter(item => item.type === 'text').map(item => item.text).join('');
  assert.doesNotMatch(text, /https?:|misleading|wrong-green|\.jpg|caption/);
  assert.deepEqual(downloads, [fixture.thumbnailUrl]);
  const id = JSON.parse(result.content[1].text).candidate_id;
  assert.match(id, /^[a-f0-9]{24}$/);
  const links = JSON.parse(scout.links([id]).content[0].text);
  assert.equal(links.selections[0].image_url, fixture.originalUrl);
  assert.equal(links.selections[0].source_page_url, fixture.sourcePageUrl);
  const inspected = await scout.inspect(id);
  assert.equal(JSON.parse(inspected.content[0].text).view, 'original_image_resized');
  assert.equal(JSON.parse(inspected.content[0].text).width, 1200);
  assert.equal(downloads.at(-1), fixture.originalUrl);
});

test('unavailable images are skipped; original-inspection failure is explicitly labeled', async () => {
  const scout = new ImageScout(config, {
    provider: { search: async () => [{ ...fixture, originalUrl: 'https://example.com/fail', thumbnailUrl: 'https://example.com/fail' }, fixture] },
    download: async url => { if (url.includes('fail') || url === fixture.originalUrl) throw new Error('Blocked'); return { buffer: raster }; },
  });
  const result = await scout.search({ query: 'red object', count: 1 });
  assert.equal(JSON.parse(result.content[0].text).skipped, 1);
  const id = JSON.parse(result.content[1].text).candidate_id;
  const inspected = await scout.inspect(id);
  assert.equal(JSON.parse(inspected.content[0].text).view, 'search_preview_only_original_unavailable');
  assert.equal(inspected.content[1].type, 'image');
});

test('no downloaded images produces an error without claiming visual inspection', async () => {
  const scout = new ImageScout(config, { provider: { search: async () => [fixture] }, download: async () => { throw new Error('No access'); } });
  const result = await scout.search({ query: 'anything' });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /No pictures were supplied/);
});

test('candidate cache expires and obeys its byte budget', () => {
  let now = 0;
  const cache = new CandidateCache({ maxEntries: 2, maxBytes: 5, ttlMs: 100, now: () => now });
  const first = cache.add({ preview: { buffer: Buffer.alloc(3) } });
  const second = cache.add({ preview: { buffer: Buffer.alloc(3) } });
  assert.throws(() => cache.get(first), /expired/);
  assert.ok(cache.get(second));
  now = 101;
  assert.throws(() => cache.get(second), /expired/);
  assert.equal(cache.bytes, 0);
});

test('Brave parser uses original-image vs source-page fields correctly and drops unsafe URLs', () => {
  const parsed = parseBraveResults({ results: [
    { url: 'https://example.com/page', properties: { url: 'https://example.com/image.jpg' }, thumbnail: { src: 'https://example.com/thumb.jpg' }, title: 'Never returned to model' },
    { properties: { url: 'http://127.0.0.1/secret' } },
  ] });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].originalUrl, 'https://example.com/image.jpg');
  assert.equal(parsed[0].sourcePageUrl, 'https://example.com/page');
  assert.equal(parsed[0].title, undefined);
});

test('Wikimedia parser handles results and ignores non-image files', () => {
  const parsed = parseWikimediaResults({ query: { pages: [
    { index: 2, imageinfo: [{ url: 'https://example.com/file.pdf', mime: 'application/pdf' }] },
    { index: 1, imageinfo: [{ url: 'https://example.com/photo.jpg', thumburl: 'https://example.com/thumb.jpg', descriptionurl: 'https://example.com/page', mime: 'image/jpeg' }] },
  ] } });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].thumbnailUrl, 'https://example.com/thumb.jpg');
  assert.deepEqual(parseWikimediaResults({ batchcomplete: true }), []);
});

test('Brave request uses documented query fields without unsupported offset and caches next batches', async () => {
  let requests = 0;
  const provider = new SearchProvider({ ...config, provider: 'brave', braveApiKey: 'fake-key' }, async (value, options) => {
    requests++;
    const url = new URL(value);
    assert.equal(url.searchParams.get('q'), 'red bird');
    assert.equal(url.searchParams.has('offset'), false);
    assert.equal(url.searchParams.get('safesearch'), 'strict');
    assert.equal(options.headers['X-Subscription-Token'], 'fake-key');
    return { results: [{ url: 'https://example.com/page', properties: { url: 'https://example.com/img.jpg' } }] };
  });
  await provider.search('red bird', { count: 6 });
  await provider.search('red bird', { count: 6, start: 6 });
  assert.equal(requests, 1);
});

test('missing Brave key reports the required setup instead of fabricating results', async () => {
  const provider = new SearchProvider({ ...config, provider: 'brave', braveApiKey: '' });
  await assert.rejects(provider.search('cat', { count: 1 }), /BRAVE_API_KEY/);
});

test('self-test answer is withheld, expires, and is consumed on success', async () => {
  let now = 0;
  const vision = new VisionSelfTest({ now: () => now });
  const { id, image } = await vision.create();
  const code = vision.challenges.get(id).code;
  assert.ok(image.buffer.length > 100);
  assert.equal(vision.check(id, '000000').passed, false);
  assert.equal(vision.check(id, code).passed, true);
  assert.equal(vision.check(id, code).passed, false);
  const next = await vision.create();
  now = 600001;
  assert.equal(vision.check(next.id, vision.challenges.get(next.id).code).passed, false);
});
