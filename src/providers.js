import { downloadJson, validatePublicUrl } from './network.js';

function publicUrl(value) {
  if (typeof value !== 'string') return null;
  try { return validatePublicUrl(value).href; } catch { return null; }
}

export function parseBraveResults(payload) {
  if (!Array.isArray(payload?.results)) throw new Error('Brave did not return an image-results list.');
  return payload.results.flatMap(result => {
    const originalUrl = publicUrl(result.properties?.url);
    const thumbnailUrl = publicUrl(result.thumbnail?.src);
    if (!originalUrl && !thumbnailUrl) return [];
    return [{
      originalUrl: originalUrl || thumbnailUrl,
      thumbnailUrl: thumbnailUrl || originalUrl,
      sourcePageUrl: publicUrl(result.url),
      provider: 'brave',
    }];
  });
}

export function parseWikimediaResults(payload) {
  if (payload?.error) throw new Error('Wikimedia could not complete this search.');
  const pages = payload?.query?.pages || [];
  return Object.values(pages).sort((a, b) => (a.index || 0) - (b.index || 0)).flatMap(page => {
    const image = page.imageinfo?.[0];
    const originalUrl = publicUrl(image?.url);
    const thumbnailUrl = publicUrl(image?.thumburl);
    if (!image || !String(image.mime || '').startsWith('image/') || (!originalUrl && !thumbnailUrl)) return [];
    return [{
      originalUrl: originalUrl || thumbnailUrl,
      thumbnailUrl: thumbnailUrl || originalUrl,
      sourcePageUrl: publicUrl(image.descriptionurl),
      provider: 'wikimedia',
    }];
  });
}

export class SearchProvider {
  constructor(config, getJson = downloadJson) {
    this.config = config;
    this.getJson = getJson;
    this.cache = new Map();
    this.lastBraveRequest = 0;
    this.braveQueue = Promise.resolve();
  }

  async search(query, { count, start = 0, language = 'en', country = 'ALL' }) {
    const requested = Math.min(80, start + count + 6);
    const key = JSON.stringify([query, language, country]);
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now() && cached.requested >= requested) return cached.results;
    // A short cache avoids paying again when asking for the next batch.
    const results = this.config.provider === 'brave'
      ? await this.brave(query, Math.max(30, requested), language, country)
      : await this.wikimedia(query, Math.max(20, requested));
    const unique = [...new Map(results.map(result => [result.originalUrl, result])).values()];
    if (this.cache.size >= 32) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, { results: unique, requested: Math.max(this.config.provider === 'brave' ? 30 : 20, requested), expires: Date.now() + 120000 });
    return unique;
  }

  async brave(query, count, language, country) {
    if (!this.config.braveApiKey) throw new Error('Add BRAVE_API_KEY on your host, or set SEARCH_PROVIDER=wikimedia for a key-free Commons-only search.');
    // Serialize paid search calls, with at most one new request per second.
    const task = this.braveQueue.catch(() => {}).then(async () => {
      const delay = Math.max(0, 1050 - (Date.now() - this.lastBraveRequest));
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      this.lastBraveRequest = Date.now();
      const url = new URL('https://api.search.brave.com/res/v1/images/search');
      url.search = new URLSearchParams({ q: query, count: String(count), safesearch: 'strict', search_lang: language, country, spellcheck: 'false' });
      try {
        return parseBraveResults(await this.getJson(url.href, {
          headers: { Accept: 'application/json', 'X-Subscription-Token': this.config.braveApiKey, 'User-Agent': this.config.userAgent },
        }));
      } catch (error) {
        if (/HTTP 401|HTTP 403/.test(error.message)) throw new Error('Brave rejected the API key or image-search permission. Check your Brave Search API subscription.');
        if (/HTTP 429/.test(error.message)) throw new Error('Brave rate limit or quota reached. Wait, or check your Brave plan.');
        throw error;
      }
    });
    this.braveQueue = task;
    return task;
  }

  async wikimedia(query, count) {
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    url.search = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', generator: 'search',
      gsrsearch: query, gsrnamespace: '6', gsrlimit: String(Math.min(50, count)),
      prop: 'imageinfo', iiprop: 'url|size|mime', iiurlwidth: '768',
    });
    return parseWikimediaResults(await this.getJson(url.href, { headers: { Accept: 'application/json', 'User-Agent': this.config.userAgent } }));
  }
}
