import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';

export class DownloadError extends Error {}

export function isPublicAddress(value) {
  try {
    let address = ipaddr.parse(value);
    if (address.kind() === 'ipv6' && address.isIPv4MappedAddress()) address = address.toIPv4Address();
    return address.range() === 'unicast';
  } catch { return false; }
}

export function validatePublicUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new DownloadError('Invalid image URL.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new DownloadError('Only public HTTP(S) URLs without credentials are allowed.');
  }
  if (url.href.length > 8192 || (url.port && url.port !== '80' && url.port !== '443')) {
    throw new DownloadError('Unsupported image URL or port.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new DownloadError('Private and reserved network addresses are blocked.');
  } else if (!host.includes('.') || /\.(localhost|local|internal|home|test|invalid)$/.test(host)) {
    throw new DownloadError('Private hostnames are blocked.');
  }
  url.hash = '';
  return url;
}

// This resolver is used by the actual socket connection, not by a separate
// preflight check. That prevents DNS from changing between validation and use.
export function makeSafeLookup(resolve = dns.lookup) {
  return (hostname, options, callback) => {
    resolve(hostname, { all: true, verbatim: true }).then(records => {
      if (!records.length || records.some(record => !isPublicAddress(record.address))) {
        return callback(new DownloadError('DNS resolved to a private or reserved address.'));
      }
      const family = typeof options === 'object' ? options.family : options;
      const usable = family === 4 || family === 6 ? records.filter(record => record.family === family) : records;
      if (!usable.length) return callback(new DownloadError('No usable public address.'));
      if (options?.all) callback(null, usable);
      else callback(null, usable[0].address, usable[0].family);
    }).catch(callback);
  };
}

const safeLookup = makeSafeLookup();

export async function downloadBuffer(value, {
  maxBytes = 10 * 1024 * 1024,
  timeoutMs = 12000,
  maxRedirects = 3,
  method = 'GET',
  body = null,
  headers = {},
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let url = validatePublicUrl(value);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new DownloadError('Download timed out.');
    const result = await requestOnce(url, { maxBytes, timeoutMs: remaining, method, body, headers });
    if (result.redirect) {
      if (hop === maxRedirects) throw new DownloadError('Too many redirects.');
      const next = validatePublicUrl(new URL(result.redirect, url).href);
      // Do not forward private API headers to a different origin.
      if (next.origin !== url.origin && Object.keys(headers).some(name => !['accept', 'user-agent'].includes(name.toLowerCase()))) {
        throw new DownloadError('Cross-origin redirect with private headers was blocked.');
      }
      url = next;
      continue;
    }
    return { ...result, finalUrl: url.href };
  }
  throw new DownloadError('Download failed.');
}

function requestOnce(url, { maxBytes, timeoutMs, method = 'GET', body = null, headers }) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const options = {
      lookup: safeLookup,
      agent: false,
      method,
      headers: { 'Accept-Encoding': 'identity', ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    };
    const onResponse = response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        const redirect = response.headers.location;
        response.destroy();
        resolve({ redirect });
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.destroy();
        reject(new DownloadError(`Remote host returned HTTP ${response.statusCode}.`));
        return;
      }
      const size = Number(response.headers['content-length']);
      if (Number.isFinite(size) && size > maxBytes) {
        response.destroy();
        reject(new DownloadError('File is too large.'));
        return;
      }
      let bytes = 0;
      const chunks = [];
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          response.destroy(new DownloadError('File is too large.'));
        } else chunks.push(chunk);
      });
      response.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: String(response.headers['content-type'] || '') }));
      response.on('error', reject);
    };
    const request = method === 'GET' && body == null
      ? transport.get(url, options, onResponse)
      : transport.request(url, options, onResponse);
    if (method !== 'GET' || body != null) {
      if (body != null) request.write(body);
      request.end();
    }
    request.on('error', error => {
      reject(error instanceof DownloadError ? error : new DownloadError(error.name === 'AbortError' ? 'Download timed out.' : 'Could not download from this host.'));
    });
  });
}

export async function downloadJson(url, options = {}) {
  const { buffer } = await downloadBuffer(url, { maxBytes: 2 * 1024 * 1024, maxRedirects: 0, ...options });
  try { return JSON.parse(buffer.toString('utf8')); }
  catch { throw new DownloadError('Search provider returned invalid JSON.'); }
}

export async function downloadText(url, options = {}) {
  const result = await downloadBuffer(url, { maxBytes: 4 * 1024 * 1024, maxRedirects: 0, ...options });
  return { ...result, text: result.buffer.toString('utf8') };
}
