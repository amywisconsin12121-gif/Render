import { readFile } from 'node:fs/promises';
import { imageContent } from './images.js';

export const GALLERY_URI = 'ui://image-scout/image-gallery-v1.html';
export const GALLERY_MIME_TYPE = 'text/html;profile=mcp-app';
export const galleryHtml = await readFile(new URL('../public/image-gallery.html', import.meta.url), 'utf8');
export const galleryToolMeta = {
  ui: { resourceUri: GALLERY_URI },
  'openai/outputTemplate': GALLERY_URI,
  'openai/toolInvocation/invoking': 'Downloading image copies…',
  'openai/toolInvocation/invoked': 'Images ready to view',
};

export function galleryResult(title, pictures, message) {
  const images = pictures.map(({ id, image, view }) => ({
    candidate_id: id,
    file_name: `image-scout-${id}.${image.mimeType === 'image/png' ? 'png' : 'jpg'}`,
    mime_type: image.mimeType,
    width: image.width,
    height: image.height,
    view,
  }));
  return {
    structuredContent: { title, images },
    content: [
      { type: 'text', text: JSON.stringify({ title, images, instructions: message }) },
      ...pictures.map(({ image }) => imageContent(image)),
    ],
    // UI-only bytes are carried inside the MCP result. No image-host URL,
    // remote fetch, invented ChatGPT file ID, or private server token is used.
    _meta: {
      imageScoutGallery: {
        title,
        images: pictures.map(({ image }, index) => ({ ...images[index], base64: image.buffer.toString('base64') })),
      },
    },
  };
}

export function registerGalleryResource(mcp) {
  const meta = {
    ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } },
    'openai/widgetDescription': 'Displays downloaded image copies inside the chat, with supported file download and Save to ChatGPT controls.',
    'openai/widgetPrefersBorder': true,
    'openai/widgetCSP': { connect_domains: [], resource_domains: [] },
    'openai/ui': { availableDisplayModes: ['inline', 'fullscreen'] },
  };
  mcp.registerResource('image-scout-gallery', GALLERY_URI, { mimeType: GALLERY_MIME_TYPE, _meta: meta }, async () => ({
    contents: [{ uri: GALLERY_URI, mimeType: GALLERY_MIME_TYPE, text: galleryHtml, _meta: meta }],
  }));
}
