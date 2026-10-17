import { CandidateCache } from './cache.js';
import { downloadBuffer } from './network.js';
import { normalizeImage, imageContent } from './images.js';
import { SearchProvider } from './providers.js';
import { VisionSelfTest } from './self-test.js';
import { galleryResult } from './gallery.js';

export const textContent = value => ({ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) });

export class ImageScout {
  constructor(config, { provider, download = downloadBuffer, normalize = normalizeImage } = {}) {
    this.config = config;
    this.provider = provider || new SearchProvider(config);
    this.download = download;
    this.normalize = normalize;
    this.candidates = new CandidateCache({ maxEntries: config.cacheMaxEntries, maxBytes: config.cacheMaxBytes, ttlMs: config.cacheTtlMs });
    this.vision = new VisionSelfTest();
    this.imageJobs = 0;
    this.imageWaiters = [];
  }

  async fetchImage(url, maxSide = 768, deadline = Date.now() + 12000) {
    if (this.imageJobs >= 2) await new Promise(resolve => this.imageWaiters.push(resolve));
    else this.imageJobs++;
    try {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('Image request time budget used up.');
      const { buffer } = await this.download(url, { timeoutMs: Math.min(12000, remaining), headers: { Accept: 'image/*', 'User-Agent': this.config.userAgent } });
      return await this.normalize(buffer, { maxSide, maxBytes: maxSide > 768 ? 850000 : 350000 });
    } finally {
      const next = this.imageWaiters.shift();
      if (next) next();
      else this.imageJobs--;
    }
  }

  async search({ query, count = 6, start = 0, language = 'en', country = 'ALL' }) {
    if (query.split(/\s+/).length > 50) throw new Error('Keep the search term to 50 words or fewer.');
    const results = await this.provider.search(query, { count, start, language, country });
    const loaded = [];
    const deadline = Date.now() + 35000;
    let cursor = Math.min(start, results.length);
    let skipped = 0;
    // Fetch in small groups and preserve provider order. Stop after enough
    // successful images, not merely after enough search records.
    while (loaded.length < count && cursor < results.length && cursor < start + count + 6 && Date.now() < deadline) {
      const group = results.slice(cursor, cursor + Math.min(3, count - loaded.length));
      const attempts = await Promise.all(group.map(async candidate => {
        try {
          const preview = await this.fetchImage(candidate.thumbnailUrl, 768, deadline);
          return { ...candidate, preview };
        } catch {
          // Some search thumbnails fail while the original remains reachable.
          if (candidate.originalUrl !== candidate.thumbnailUrl) {
            try { return { ...candidate, preview: await this.fetchImage(candidate.originalUrl, 768, deadline) }; } catch {}
          }
          return null;
        }
      }));
      cursor += group.length;
      for (const candidate of attempts) {
        if (!candidate) { skipped++; continue; }
        const id = this.candidates.add(candidate);
        loaded.push({ id, candidate });
      }
    }
    if (!loaded.length) {
      return {
        isError: true,
        content: [textContent(results.length
          ? 'Search found candidates, but none could be downloaded and decoded. No pictures were supplied. Try another query or provider; do not claim visual verification.'
          : 'No candidate images found. Try a broader or different search term.')],
      };
    }
    const content = [textContent({
      query, provider: this.config.provider, images_supplied: loaded.length, skipped,
      next_start: cursor < results.length ? cursor : null,
      instructions: 'The following blocks contain actual image pixels. Each neutral ID labels the image immediately after it. Judge visible content, not metadata. Use inspect_image for detail, show_images to display the chosen IDs, then get_image_links for their sources. If these image blocks are not visible to you, say so. This server does not decide which picture matches.',
    })];
    for (const { id, candidate } of loaded) {
      content.push(textContent({ candidate_id: id, view: 'search_preview', width: candidate.preview.width, height: candidate.preview.height }));
      content.push(imageContent(candidate.preview));
    }
    return { content };
  }

  async loadCandidateImage(id, preferOriginal = true) {
    const candidate = this.candidates.get(id);
    let image = candidate.preview;
    let view = 'original_image_resized';
    if (preferOriginal) {
      try { image = await this.fetchImage(candidate.originalUrl, 1600); }
      catch { view = 'search_preview_only_original_unavailable'; }
    } else {
      view = 'search_preview';
    }
    return { id, image, view };
  }

  async inspect(id) {
    const { image, view } = await this.loadCandidateImage(id);
    // No filename, title, alt text, or source URL is exposed at this stage.
    return { content: [textContent({ candidate_id: id, view, width: image.width, height: image.height }), imageContent(image)] };
  }

  async show(ids, title = 'Selected images', preferOriginal = true) {
    const unique = [...new Set(ids)];
    if (unique.length < 1 || unique.length > 4) throw new Error('Display one to four candidate images at a time.');
    // Validate all IDs before making outbound requests for any of them.
    for (const id of unique) this.candidates.get(id);
    const pictures = await Promise.all(unique.map(id => this.loadCandidateImage(id, preferOriginal)));
    return galleryResult(title, pictures,
      'The plugin downloaded real image copies and supplied their bytes to the in-chat viewer. Do not replace the viewer with an external Markdown image or invent a sandbox path. A standard MCP image payload is also supplied for visual inspection. File download and Save to ChatGPT controls depend on the host. This does not automatically create a native chat attachment or write to Python. Return source links with get_image_links.');
  }

  links(ids) {
    const selections = ids.map(id => {
      const candidate = this.candidates.get(id);
      return {
        candidate_id: id,
        image_url: candidate.originalUrl,
        source_page_url: candidate.sourcePageUrl,
        preview_url: candidate.thumbnailUrl,
      };
    });
    return { content: [textContent({
      selections,
      instructions: 'Return the selected original-image link and source-page link. Use show_images to display downloaded copies in the plugin viewer; external Markdown image embeds are not required. Links can fail or change at the original host. Explain the match using what you actually saw, and acknowledge uncertainty. Fetching pixels does not by itself prove you visually checked them.',
    })] };
  }

  async selfTest() {
    const { id, image } = await this.vision.create();
    const result = galleryResult('Image delivery test', [{ id, image, view: 'vision_self_test' }],
      'The user-facing viewer should show the test picture. Independently read the six-digit number from the MCP image content, then call check_image_vision. If you cannot see the image, report that honestly.');
    result.content.unshift(textContent({ challenge_id: id, instructions: 'Read the six-digit number in this image, then call check_image_vision with this challenge_id and the number. The answer is not in the text or ID. If you cannot see the image, report that honestly.' }));
    return result;
  }
}
