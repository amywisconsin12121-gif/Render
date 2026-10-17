import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import sharp from 'sharp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/server.js';
import { ImageScout } from '../src/service.js';

const config = loadConfig({ MCP_SECRET: 'test-only-server-secret-1234567890abcd', SEARCH_PROVIDER: 'wikimedia' });
const fixture = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#2060ee' } }).png().toBuffer();

async function start(t, overrides = {}) {
  const cfg = { ...config, ...overrides };
  const scout = new ImageScout(cfg, {
    provider: { search: async () => [{ originalUrl: 'https://example.com/original.jpg', thumbnailUrl: 'https://example.com/thumb.jpg', sourcePageUrl: 'https://example.com/source', provider: 'wikimedia' }] },
    download: async () => ({ buffer: fixture }),
  });
  const { app } = createApp(cfg, { scout });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, endpoint: `${base}/mcp/${cfg.mcpToken}`, scout };
}

test('official MCP client can discover tools, receive real image blocks, inspect, and resolve links', async t => {
  const { endpoint, scout } = await start(t);
  const client = new Client({ name: 'automated-check', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
  const { tools } = await client.listTools();
  assert.equal(tools.length, 5);
  assert.ok(tools.every(tool => tool.annotations.readOnlyHint));
  const challenge = await client.callTool({ name: 'vision_self_test', arguments: {} });
  const metadata = JSON.parse(challenge.content[0].text);
  const code = scout.vision.challenges.get(metadata.challenge_id).code;
  assert.equal(challenge.content[0].text.includes(code), false, 'The answer must not be in text metadata.');
  const image = challenge.content.find(block => block.type === 'image');
  assert.equal(image.mimeType, 'image/png');
  assert.equal((await sharp(Buffer.from(image.data, 'base64')).metadata()).width, 540);
  const checked = await client.callTool({ name: 'check_image_vision', arguments: { challenge_id: metadata.challenge_id, answer: code } });
  assert.equal(JSON.parse(checked.content[0].text).passed, true);
  const found = await client.callTool({ name: 'search_images', arguments: { query: 'blue square', count: 1 } });
  assert.equal(found.content[2].type, 'image');
  assert.doesNotMatch(found.content.filter(block => block.type === 'text').map(block => block.text).join(''), /https:\/\/example/);
  const id = JSON.parse(found.content[1].text).candidate_id;
  const inspected = await client.callTool({ name: 'inspect_image', arguments: { candidate_id: id } });
  assert.equal(inspected.content[1].type, 'image');
  const resolved = await client.callTool({ name: 'get_image_links', arguments: { candidate_ids: [id] } });
  assert.equal(JSON.parse(resolved.content[0].text).selections[0].image_url, 'https://example.com/original.jpg');
});

test('HTTP gate keeps the secret private and rejects bad origin, bad payloads, and GET on MCP', async t => {
  const { base, endpoint } = await start(t);
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.equal((await fetch(`${base}/mcp/wrong`)).status, 404);
  assert.equal((await fetch(endpoint)).status, 405);
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' })).status, 400);
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oversized: 'x'.repeat(70000) }) })).status, 413);
  const homepage = await fetch(base);
  const html = await homepage.text();
  assert.equal(html.includes(config.mcpToken), false);
  assert.match(homepage.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});

test('global request limit is enforced without trusting spoofed proxy headers', async t => {
  const { endpoint } = await start(t, { requestLimitPerMinute: 1 });
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'limit-test', version: '1' } } });
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body };
  assert.equal((await fetch(endpoint, options)).status, 200);
  assert.equal((await fetch(endpoint, { ...options, headers: { ...options.headers, 'X-Forwarded-For': '8.8.8.8' } })).status, 429);
});
