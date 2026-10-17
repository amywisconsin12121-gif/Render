import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import sharp from 'sharp';
import { loadConfig } from '../src/config.js';

const config = process.env.MCP_URL ? null : loadConfig();
const url = process.env.MCP_URL || `http://localhost:${config.port}/mcp/${config.mcpToken}`;
const client = new Client({ name: 'image-scout-smoke', version: '1.0.0' });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  const { tools } = await client.listTools();
  assert.equal(tools.length, 6);
  assert.ok(tools.find(tool => tool.name === 'show_images')?._meta?.ui?.resourceUri);
  const resources = await client.listResources();
  const template = await client.readResource({ uri: resources.resources[0].uri });
  assert.equal(template.contents[0].mimeType, 'text/html;profile=mcp-app');
  const result = await client.callTool({ name: 'vision_self_test', arguments: {} });
  const block = result.content.find(item => item.type === 'image');
  assert.ok(block?.data, 'Self-test did not return an image content block.');
  const metadata = await sharp(Buffer.from(block.data, 'base64')).metadata();
  assert.equal(metadata.width, 540);
  assert.ok(result._meta?.imageScoutGallery?.images[0]?.base64, 'Viewer did not receive image bytes.');
  console.log('MCP connection, tool discovery, and real image transport passed.');
  const searchIndex = process.argv.indexOf('--search');
  if (searchIndex !== -1) {
    const query = process.argv[searchIndex + 1];
    if (!query) throw new Error('Provide a term after --search.');
    const search = await client.callTool({ name: 'search_images', arguments: { query, count: 2 } });
    if (search.isError) throw new Error(search.content.filter(item => item.type === 'text').map(item => item.text).join('\n'));
    const images = search.content.filter(item => item.type === 'image');
    assert.ok(images.length > 0, 'No actual image pixels received.');
    console.log(`Live search returned ${images.length} image payload(s).`);
  }
  console.log('Next: run the visual self-test inside regular ChatGPT. Confirm both that the model reads the code and that YOU see the picture in the viewer.');
} catch (error) {
  // Connection errors may include the private URL. Never print that URL.
  console.error('Smoke check failed:', error.message.replace(/https?:\/\/[^\s)]+/g, '[private URL]'));
  process.exitCode = 1;
} finally { await client.close(); }
