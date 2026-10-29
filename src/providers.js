import { downloadJson, downloadText, validatePublicUrl } from './network.js';

function publicUrl(value) {
  if (typeof value !== 'string') return null;
  try { return validatePublicUrl(value).href; } catch { return null; }
}

function htmlUnescape(value) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x2f;/gi, '/')
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, number) => {
      const code = number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    });
}

function decodeGoogleString(value) {
  let decoded = htmlUnescape(String(value))
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\x([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
  try {
    decoded = decodeURIComponent(decoded);
  } catch {}
  return decoded.replace(/[\u0000-\u001f]/g, '').trim();
}

function unwrapGoogleImageUrl(value) {
  const decoded = decodeGoogleString(value)
    .replace(/[),;]+$/, '')
    .replace(/&(?:amp;)+/gi, '&');
  let url;
  try { url = new URL(decoded); } catch { return { url: decoded, wrapper: null }; }
  const imageParameter = url.searchParams.get('imgurl') || url.searchParams.get('mediaurl');
  if (imageParameter) return {
    url: decodeGoogleString(imageParameter),
    source: publicUrl(url.searchParams.get('imgrefurl') || url.searchParams.get('urlref')),
    wrapper: url,
  };
  return { url: decoded, source: null, wrapper: url };
}

function isGoogleHost(hostname) {
  const host = hostname.toLowerCase();
  return host === 'google.com' || host.endsWith('.google.com') || host.endsWith('.googleusercontent.com') || host.endsWith('.gstatic.com');
}

function isGoogleThumbnail(value) {
  try {
    const url = new URL(value);
    return /^(?:encrypted-tbn\d*|encrypted-tbn)\./i.test(url.hostname) || url.hostname.endsWith('.googleusercontent.com');
  } catch { return false; }
}

function looksLikeImageUrl(value) {
  try {
    const url = new URL(value);
    const path = url.pathname.toLowerCase();
    return isGoogleThumbnail(value)
      || /\.(?:jpe?g|png|gif|webp|avif|bmp|tiff?|ico)(?:$|[?#])/i.test(path)
      || /(?:^|[?&])(?:format|fm|type|mime)=(?:jpe?g|png|gif|webp|avif)/i.test(url.search);
  } catch { return false; }
}

function isImageRecord(item) {
  if (looksLikeImageUrl(item.url)) return true;
  if (!item.imageHint) return false;
  try { return !isGoogleHost(new URL(item.url).hostname); } catch { return false; }
}

function extractGoogleUrls(html) {
  const matches = [];
  // Extract URL-shaped strings without executing Google's scripts. This works
  // with JSON, AF_initDataCallback, and imgres links.
  const pattern = /https?:\\?\/\\?\/[^"'<>\s]+/gi;
  for (const match of html.matchAll(pattern)) {
    const raw = match[0];
    const { url, source } = unwrapGoogleImageUrl(raw);
    const safe = publicUrl(url);
    if (!safe) continue;
    if (matches.length >= 2400) break;
    const position = match.index || 0;
    const following = html.slice(position + raw.length, Math.min(html.length, position + raw.length + 180));
    const imageHint = /^\s*["']?\s*,\s*\d{2,6}\s*,\s*\d{2,6}/.test(following);
    matches.push({ raw, url: safe, source, imageHint, position });
  }
  return matches;
}

function nearestSourceUrl(urls, position, used) {
  const nearby = urls
    .filter(item => Math.abs(item.position - position) <= 1400 && item.url !== used)
    .sort((a, b) => Math.abs(a.position - position) - Math.abs(b.position - position));
  return nearby.find(item => !isImageRecord(item) && !isGoogleHost(new URL(item.url).hostname))?.url || null;
}

export function parseGoogleHtmlResults(html) {
  if (typeof html !== 'string') throw new Error('Google did not return an image-search page.');
  if (/unusual traffic|captcha-form|\/sorry\/|data-sitekey/i.test(html)) {
    throw new Error('Google returned a human-verification page. The no-key Google mode is blocked from this host right now.');
  }
  const urls = extractGoogleUrls(html);
  const images = urls.filter(isImageRecord);
  const thumbnails = images.filter(item => isGoogleThumbnail(item.url));
  const directImages = images.filter(item => !isGoogleThumbnail(item.url));
  const results = [];
  const seen = new Set();

  for (const image of directImages) {
    const sourcePageUrl = image.source || nearestSourceUrl(urls, image.position, image.url);
    const key = image.url;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ originalUrl: image.url, thumbnailUrl: image.url, sourcePageUrl, provider: 'google' });
  }

  // If Google exposes only a thumbnail, keep it usable rather than inventing
  // an original URL. If an original is nearby, pair it with the thumbnail.
  for (const thumbnail of thumbnails) {
    const nearbyOriginal = directImages
      .filter(item => Math.abs(item.position - thumbnail.position) <= 1400)
      .sort((a, b) => Math.abs(a.position - thumbnail.position) - Math.abs(b.position - thumbnail.position))[0];
    const originalUrl = nearbyOriginal?.url || thumbnail.url;
    const sourcePageUrl = thumbnail.source || nearbyOriginal?.source || nearestSourceUrl(urls, thumbnail.position, originalUrl) || (nearbyOriginal ? nearestSourceUrl(urls, nearbyOriginal.position, originalUrl) : null);
    const key = originalUrl;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ originalUrl, thumbnailUrl: thumbnail.url, sourcePageUrl, provider: 'google' });
  }
  return results;
}

export function parseGoogleApiResults(payload) {
  if (payload?.error) throw new Error('Google image search API returned an error. Check the API key, search-engine ID, quota, and billing settings.');
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.flatMap(result => {
    const originalUrl = publicUrl(result.link);
    const thumbnailUrl = publicUrl(result.image?.thumbnailLink);
    if (!originalUrl && !thumbnailUrl) return [];
    return [{
      originalUrl: originalUrl || thumbnailUrl,
      thumbnailUrl: thumbnailUrl || originalUrl,
      sourcePageUrl: publicUrl(result.image?.contextLink),
      provider: 'google',
    }];
  });
}

export function parseSerperResults(payload) {
  if (payload?.message && !Array.isArray(payload?.images)) throw new Error('Serper returned an API error. Check the API key and quota.');
  const items = Array.isArray(payload?.images) ? payload.images : [];
  return items.flatMap(result => {
    const originalUrl = publicUrl(result.imageUrl || result.original || result.originalUrl);
    const thumbnailUrl = publicUrl(result.thumbnailUrl || result.thumbnail);
    if (!originalUrl && !thumbnailUrl) return [];
    return [{
      originalUrl: originalUrl || thumbnailUrl,
      thumbnailUrl: thumbnailUrl || originalUrl,
      sourcePageUrl: publicUrl(result.link || result.source?.link),
      provider: 'serper',
    }];
  });
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
  constructor(config, getJson = downloadJson, getText = downloadText) {
    this.config = config;
    this.getJson = getJson;
    this.getText = getText;
    this.cache = new Map();
    this.lastBraveRequest = 0;
    this.braveQueue = Promise.resolve();
  }

  async search(query, { count, start = 0, language = 'en', country = 'ALL' }) {
    const requested = Math.min(80, start + count + 6);
    const key = JSON.stringify([this.config.provider, this.config.googleMode, query, language, country]);
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now() && cached.requested >= requested) return cached.results;
    const results = this.config.provider === 'brave'
      ? await this.brave(query, Math.max(30, requested), language, country)
      : this.config.provider === 'wikimedia'
        ? await this.wikimedia(query, Math.max(20, requested))
        : this.config.provider === 'serper'
          ? await this.serper(query, Math.max(30, requested), language, country)
          : await this.google(query, Math.max(30, requested), language, country);
    const unique = [...new Map(results.map(result => [`${result.originalUrl}\n${result.thumbnailUrl}`, result])).values()];
    if (this.cache.size >= 32) this.cache.delete(this.cache.keys().next().value);
    const covered = ['brave', 'serper'].includes(this.config.provider) ? Math.max(30, requested) : requested;
    this.cache.set(key, { results: unique, requested: covered, expires: Date.now() + 120000 });
    return unique;
  }

  async google(query, count, language, country) {
    if (this.config.googleMode === 'api') return this.googleApi(query, count, language, country);
    return this.googleHtml(query, count, language, country);
  }

  async serper(query, count, language, country) {
    if (!this.config.serperApiKey) throw new Error('Add SERPER_API_KEY on your host to use Google Images through Serper.');
    const body = JSON.stringify({
      q: query,
      hl: language.split('-')[0],
      ...(country !== 'ALL' ? { gl: country.toLowerCase() } : {}),
      num: Math.min(100, count),
    });
    try {
      const payload = await this.getJson('https://google.serper.dev/images', {
        method: 'POST',
        body,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(body)),
          'X-API-KEY': this.config.serperApiKey,
          'User-Agent': this.config.userAgent,
        },
      });
      const results = parseSerperResults(payload);
      if (!results.length) throw new Error('Serper returned no image candidates for this query.');
      return results.slice(0, count);
    } catch (error) {
      if (/HTTP 401|HTTP 403/.test(error.message)) throw new Error('Serper rejected the API key. Check SERPER_API_KEY.');
      if (/HTTP 429/.test(error.message)) throw new Error('Serper quota or rate limit reached. Check your Serper account.');
      throw error;
    }
  }

  async googleHtml(query, count, language, country) {
    const url = new URL('https://www.google.com/search');
    url.search = new URLSearchParams({
      tbm: 'isch', q: query, hl: language.split('-')[0], safe: 'active', filter: '1',
      num: String(Math.min(100, count)), ...(country !== 'ALL' ? { gl: country } : {}),
    });
    let text;
    try {
      ({ text } = await this.getText(url.href, {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': `${language},en;q=0.8`,
          'User-Agent': this.config.userAgent,
        },
      }));
    } catch (error) {
      throw new Error(`Google Images could not be reached from this host. ${error.message}`);
    }
    const results = parseGoogleHtmlResults(text);
    if (!results.length) throw new Error('Google returned no parseable image candidates. The page format may have changed or this host may be blocked.');
    return results.slice(0, count);
  }

  async googleApi(query, count, language, country) {
    if (!this.config.googleApiKey || !this.config.googleCseId) {
      throw new Error('GOOGLE_MODE=api requires GOOGLE_API_KEY and GOOGLE_CSE_ID. Use GOOGLE_MODE=html for the free no-key mode.');
    }
    const results = [];
    const wanted = Math.min(30, count);
    for (let start = 1; results.length < wanted; start += 10) {
      const remaining = Math.min(10, wanted - results.length);
      const url = new URL('https://www.googleapis.com/customsearch/v1');
      url.search = new URLSearchParams({
        key: this.config.googleApiKey, cx: this.config.googleCseId, q: query,
        searchType: 'image', safe: 'active', num: String(remaining), start: String(start),
        hl: language.split('-')[0], ...(country !== 'ALL' ? { gl: country } : {}),
      });
      const page = parseGoogleApiResults(await this.getJson(url.href, { headers: { Accept: 'application/json', 'User-Agent': this.config.userAgent } }));
      results.push(...page);
      if (page.length < remaining) break;
    }
    return results;
  }

  async brave(query, count, language, country) {
    if (!this.config.braveApiKey) throw new Error('Add BRAVE_API_KEY on your host, or set SEARCH_PROVIDER=google for Google Images.');
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
