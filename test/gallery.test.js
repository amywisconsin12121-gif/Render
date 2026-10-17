import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import sharp from 'sharp';
import { loadConfig } from '../src/config.js';
import { ImageScout } from '../src/service.js';
import { galleryHtml, galleryResult } from '../src/gallery.js';

const config = loadConfig({ MCP_SECRET: 'gallery-tests-only-secret-1234567890abcd', SEARCH_PROVIDER: 'wikimedia' });
const png = await sharp({ create: { width: 40, height: 24, channels: 3, background: '#e88b23' } }).png().toBuffer();
const picture = { id: '1234567890abcdef12345678', image: { buffer: png, mimeType: 'image/png', width: 40, height: 24 }, view: 'test_copy' };
const result = galleryResult('Selected picture', [picture], 'Display these bytes.');
const flush = () => new Promise(resolve => setImmediate(resolve));

async function hostHarness(t, { capabilities = { downloadFile: {} }, upload, initial = result, legacy = false } = {}) {
  const messages = [];
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(galleryHtml, {
    runScripts: 'dangerously', url: 'https://widget.example.com', virtualConsole,
    beforeParse(window) {
      window.ResizeObserver = class { observe() {} };
      if (upload || legacy) window.openai = {
        ...(upload ? { uploadFile: upload, selectFiles() {}, setWidgetState(state) { messages.push({ method: 'widget-state', params: state }); } } : {}),
        ...(legacy ? { toolResponseMetadata: { mcp_tool_result: initial } } : {}),
      };
      window.postMessage = message => {
        messages.push(message);
        if (message.id === undefined) return;
        queueMicrotask(() => {
          const reply = message.method === 'ui/initialize'
            ? { hostCapabilities: capabilities, hostContext: { availableDisplayModes: ['inline', 'fullscreen'] } }
            : {};
          window.dispatchEvent(new window.MessageEvent('message', { source: window, data: { jsonrpc: '2.0', id: message.id, result: reply } }));
          if (message.method === 'ui/initialize' && !legacy) queueMicrotask(() => {
            window.dispatchEvent(new window.MessageEvent('message', { source: window, data: { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: initial } }));
          });
        });
      };
    },
  });
  t.after(() => dom.window.close());
  await flush();
  assert.deepEqual(errors, [], 'The standalone viewer script must run without JavaScript errors.');
  return { window: dom.window, document: dom.window.document, messages };
}

test('viewer renders actual MCP image bytes with zero external image URLs', async t => {
  const { document, messages } = await hostHarness(t);
  const image = document.querySelector('img');
  assert.equal(image.getAttribute('src'), `data:image/png;base64,${png.toString('base64')}`);
  assert.equal(document.querySelector('#empty').hidden, true);
  assert.equal(document.querySelector('[data-download]').disabled, false);
  assert.equal(document.querySelector('[data-save]').hidden, true);
  assert.equal(messages[0].method, 'ui/initialize');
  assert.ok(messages.some(message => message.method === 'ui/notifications/initialized'));
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(galleryHtml), 'The viewer must not require outbound HTTP.');
});

test('download sends the real file through the host API, not a URL for Python to fetch', async t => {
  const { document, messages } = await hostHarness(t);
  document.querySelector('[data-download]').click();
  await flush();
  const download = messages.find(message => message.method === 'ui/download-file');
  assert.equal(download.params.contents[0].resource.blob, png.toString('base64'));
  assert.equal(download.params.contents[0].resource.mimeType, 'image/png');
  assert.match(download.params.contents[0].resource.uri, /^file:\/\/\/image-scout-.*\.png$/);
  assert.match(document.querySelector('.status').textContent, /Download requested/);
});

test('optional Save to ChatGPT uploads a real File and uses only the returned file ID', async t => {
  const uploads = [];
  const { document, messages } = await hostHarness(t, { upload: async (file, options) => {
    uploads.push({ file, options }); return { fileId: 'file_from_mock_chatgpt_host' };
  } });
  document.querySelector('[data-save]').click();
  await flush();
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].file.type, 'image/png');
  assert.equal(uploads[0].file.size, png.length);
  assert.equal(uploads[0].options.library, true);
  const state = messages.find(message => message.method === 'widget-state').params;
  assert.deepEqual(Array.from(state.imageIds), ['file_from_mock_chatgpt_host']);
  assert.equal(document.querySelector('[data-save]').textContent, 'Saved to ChatGPT');
  document.querySelector('[data-save]').click();
  await flush();
  assert.equal(uploads.length, 1, 'Saving twice must not duplicate the uploaded file.');
});

test('clients without saving APIs still display pixels and do not invent file support', async t => {
  const { document, messages } = await hostHarness(t, { capabilities: {} });
  assert.ok(document.querySelector('img').src.startsWith('data:image/png;base64,'));
  assert.equal(document.querySelector('[data-download]').disabled, true);
  assert.match(document.querySelector('#notice').textContent, /not enabled file-saving/);
  document.querySelector('[data-download]').click();
  await flush();
  assert.equal(messages.some(message => message.method === 'ui/download-file'), false);
});

test('failed ChatGPT upload is reported honestly and can be retried', async t => {
  const { document, messages } = await hostHarness(t, { upload: async () => { throw new Error('Host rejected file'); } });
  document.querySelector('[data-save]').click();
  await flush();
  assert.match(document.querySelector('.status').textContent, /could not save/);
  assert.equal(document.querySelector('[data-save]').disabled, false);
  assert.equal(messages.some(message => message.method === 'widget-state'), false);
});

test('legacy ChatGPT metadata envelopes display downloaded bytes', async t => {
  const { document } = await hostHarness(t, { legacy: true });
  assert.equal(document.querySelectorAll('img').length, 1);
  assert.ok(document.querySelector('img').src.startsWith('data:image/png;base64,'));
});

test('standard content blocks work when widget metadata is absent', async t => {
  const { _meta, ...withoutMeta } = result;
  const { document } = await hostHarness(t, { initial: withoutMeta });
  assert.equal(document.querySelector('img').getAttribute('src'), `data:image/png;base64,${png.toString('base64')}`);
});

test('gallery titles are text and unsafe image data is rejected', async t => {
  const unsafe = structuredClone(result);
  unsafe._meta.imageScoutGallery.title = '<img src=x onerror="window.injected=true">';
  unsafe._meta.imageScoutGallery.images.push({ mime_type: 'image/svg+xml', base64: 'PHN2Zy8+' });
  const { document, window } = await hostHarness(t, { initial: unsafe });
  assert.match(document.querySelector('#title').textContent, /<img/);
  assert.equal(document.querySelector('#title img'), null);
  assert.equal(window.injected, undefined);
  assert.equal(document.querySelectorAll('#images img').length, 1);
});

test('show_images downloads originals, supplies named image files, and labels preview fallbacks', async () => {
  const downloads = [];
  const scout = new ImageScout(config, { download: async url => {
    downloads.push(url); if (url.includes('unavailable')) throw new Error('Unavailable'); return { buffer: png };
  } });
  const preview = { buffer: png, mimeType: 'image/png', width: 40, height: 24 };
  const id = scout.candidates.add({ originalUrl: 'https://example.com/image.jpg', thumbnailUrl: 'https://example.com/thumb.jpg', preview });
  const shown = await scout.show([id, id]);
  assert.equal(downloads.length, 1);
  assert.equal(shown._meta.imageScoutGallery.images.length, 1);
  assert.match(shown._meta.imageScoutGallery.images[0].file_name, /\.jpg$/);
  assert.equal(shown.content.find(block => block.type === 'image').mimeType, 'image/jpeg');
  assert.equal('base64' in shown.structuredContent.images[0], false);
  const failedId = scout.candidates.add({ originalUrl: 'https://example.com/unavailable', thumbnailUrl: 'https://example.com/thumb.jpg', preview });
  const fallback = await scout.show([failedId]);
  assert.equal(fallback.structuredContent.images[0].view, 'search_preview_only_original_unavailable');
  assert.equal(fallback._meta.imageScoutGallery.images[0].base64, png.toString('base64'));
});
