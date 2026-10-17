import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './mcp.js';
import { ImageScout } from './service.js';

const page = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

export function createApp(config, { scout = new ImageScout(config) } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // The service is intended for one owner. One global cap works even if a
  // proxy obscures client addresses, and avoids trusting X-Forwarded-For.
  let requests = 0;
  let windowStarted = Date.now();
  let active = 0;
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' });
    const origin = req.headers.origin;
    if (origin) {
      const permitted = new Set(['https://chatgpt.com', 'https://chat.openai.com']);
      if (config.publicBase) permitted.add(config.publicBase);
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) permitted.add(origin);
      if (!permitted.has(origin)) return res.status(403).json({ error: 'Origin not allowed.' });
    }
    if (config.publicBase) {
      const host = req.headers.host?.split(':')[0];
      if (![new URL(config.publicBase).hostname, 'localhost', '127.0.0.1'].includes(host)) {
        return res.status(403).json({ error: 'Host not allowed. Check PUBLIC_BASE_URL.' });
      }
    }
    next();
  });

  app.get('/', (req, res) => {
    res.set('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    res.type('html').send(page);
  });
  app.use('/assets', express.static(new URL('../public/', import.meta.url).pathname, { index: false, dotfiles: 'deny', etag: false }));
  app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'image-scout', search_provider: config.provider, search_ready: config.provider === 'wikimedia' || Boolean(config.braveApiKey) }));

  const authenticate = (req, res, next) => {
    const token = req.params.token || '';
    if (!/^[a-f0-9]{64}$/.test(token) || !timingSafeEqual(Buffer.from(token), Buffer.from(config.mcpToken))) return res.sendStatus(404);
    next();
  };
  app.post('/mcp/:token', authenticate, (req, res, next) => {
    if (Date.now() - windowStarted >= 60000) { requests = 0; windowStarted = Date.now(); }
    if (++requests > config.requestLimitPerMinute || active >= config.maxActiveRequests) {
      res.set('Retry-After', '10');
      return res.status(429).json({ error: 'Too many requests. Try again shortly.' });
    }
    active++;
    let done = false;
    const release = () => { if (!done) { done = true; active--; } };
    res.once('close', release);
    res.once('finish', release);
    next();
  }, express.json({ limit: '64kb' }), async (req, res) => {
    const server = createMcpServer(scout);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.once('close', () => { void transport.close(); void server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'MCP request failed.' } });
    }
  });
  app.all('/mcp/:token', authenticate, (req, res) => {
    res.set('Allow', 'POST');
    res.status(405).json({ error: 'Use a Streamable HTTP MCP client to POST here. This is not a browser page.' });
  });
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: 'Invalid or oversized request.' });
  });
  return { app, scout };
}
