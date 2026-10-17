import sharp from 'sharp';

const formats = new Set(['jpeg', 'png', 'webp', 'gif', 'heif', 'avif', 'tiff']);
sharp.cache({ memory: 24, files: 0, items: 32 });
sharp.concurrency(1);

export async function normalizeImage(buffer, { maxSide = 768, maxBytes = 350000 } = {}) {
  const inputOptions = { limitInputPixels: 36000000, animated: false, sequentialRead: true };
  let metadata;
  try { metadata = await sharp(buffer, inputOptions).metadata(); }
  catch { throw new Error('This file could not be decoded as a supported image.'); }
  if (!formats.has(metadata.format)) throw new Error('This file is not a supported raster image.');
  for (const [quality, scale] of [[82, 1], [70, 1], [60, 0.8], [50, 0.6]]) {
    const { data, info } = await sharp(buffer, inputOptions)
      .rotate().flatten({ background: '#ffffff' })
      .resize({ width: Math.round(maxSide * scale), height: Math.round(maxSide * scale), fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    if (data.length <= maxBytes) return { buffer: data, width: info.width, height: info.height, mimeType: 'image/jpeg' };
  }
  throw new Error('Image could not be reduced to a safe response size.');
}

export function imageContent(image) {
  return { type: 'image', mimeType: image.mimeType, data: image.buffer.toString('base64') };
}
