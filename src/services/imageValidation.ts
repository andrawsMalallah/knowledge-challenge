import { safeSvg } from './svgSafety.mjs';
/** Validate question-media bytes without trusting extension or HTTP Content-Type. */
export const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml'] as const;
export type ImageMime = typeof IMAGE_MIMES[number];
export const MAX_GAME_IMAGE_BYTES = 8 * 1024 * 1024;

export function validImagePath(path: string): boolean {
  return /^\/images\/[a-zA-Z0-9/_-]+\.(webp|png|jpe?g|avif|gif|svg)$/i.test(path);
}

export function imageExtension(mime:string):string {return mime==='image/jpeg'?'jpg':mime==='image/svg+xml'?'svg':mime.slice(6);}


function ascii(bytes: Uint8Array, start: number, word: string): boolean {
  return bytes.length >= start + word.length && [...word].every((ch, i) => bytes[start + i] === ch.charCodeAt(0));
}

/** Validate a minimal file signature; browsers may not reliably supply MIME metadata. */
export function hasImageSignature(bytes: Uint8Array, mime: string): mime is ImageMime {
  switch (mime) {
    case 'image/svg+xml':return safeSvg(bytes);
    case 'image/png':
      return bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n) && ascii(bytes, 12, 'IHDR');
    case 'image/jpeg':
      return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
    case 'image/webp':
      return bytes.length >= 16 && ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP');
    case 'image/gif':
      return bytes.length >= 13 && (ascii(bytes, 0, 'GIF87a') || ascii(bytes, 0, 'GIF89a'));
    case 'image/avif':
      return bytes.length >= 16 && ascii(bytes, 4, 'ftyp') &&
        (ascii(bytes, 8, 'avif') || ascii(bytes, 8, 'avis'));
    default:
      return false;
  }
}

export async function validateImageBlob(blob: Blob, path: string): Promise<void> {
  if (!validImagePath(path) || blob.size === 0 || blob.size > MAX_GAME_IMAGE_BYTES ||
      !IMAGE_MIMES.includes(blob.type as ImageMime)) {
    throw new Error(`صورة غير صالحة: ${path}`);
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!hasImageSignature(bytes, blob.type)) throw new Error(`محتوى الصورة لا يطابق نوعها: ${path}`);
  if (blob.type!=='image/svg+xml' && typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    try {
      if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 24_000_000) throw new Error('أبعاد الصورة غير صالحة');
    } finally { bitmap.close(); }
  }
}
