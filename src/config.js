import { createHash } from 'node:crypto';

export function loadConfig(env = process.env) {
  const secret = (env.MCP_SECRET || '').trim();
  if (secret.length < 32 || secret.length > 512 || secret.startsWith('replace-with-')) {
    throw new Error('Set MCP_SECRET to a random password of 32–512 characters. Run npm run setup.');
  }
  const provider = (env.SEARCH_PROVIDER || 'serper').trim().toLowerCase();
  if (!['serper', 'google', 'brave', 'wikimedia'].includes(provider)) throw new Error('SEARCH_PROVIDER must be serper, google, brave, or wikimedia.');
  const googleMode = (env.GOOGLE_MODE || 'html').trim().toLowerCase();
  if (!['html', 'api'].includes(googleMode)) throw new Error('GOOGLE_MODE must be html or api.');
  const port = Number(env.PORT || 9000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
  const publicBase = env.PUBLIC_BASE_URL || env.RENDER_EXTERNAL_URL || '';
  if (publicBase) {
    const url = new URL(publicBase);
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new Error('PUBLIC_BASE_URL must use HTTPS, except on localhost.');
    }
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('PUBLIC_BASE_URL must be just the origin, for example https://images.example.com.');
    }
  }
  return {
    port,
    host: env.HOST || '0.0.0.0',
    provider,
    serperApiKey: (env.SERPER_API_KEY || '').trim(),
    googleMode,
    googleApiKey: (env.GOOGLE_API_KEY || '').trim(),
    googleCseId: (env.GOOGLE_CSE_ID || '').trim(),
    braveApiKey: (env.BRAVE_API_KEY || '').trim(),
    mcpToken: createHash('sha256').update(secret).digest('hex'),
    publicBase: publicBase ? new URL(publicBase).origin : '',
    userAgent: env.OUTBOUND_USER_AGENT || `ImageScout/1.0 (personal image search${publicBase ? `; ${new URL(publicBase).origin}` : ''})`,
    cacheTtlMs: 30 * 60 * 1000,
    cacheMaxBytes: 32 * 1024 * 1024,
    cacheMaxEntries: 160,
    requestLimitPerMinute: 90,
    maxActiveRequests: 4,
  };
}
