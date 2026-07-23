// Downscale + recompress big phone photos in the browser BEFORE upload, so a
// 10–20 MB image becomes a ~0.5 MB JPEG. This avoids "Failed to fetch" from
// stalled mobile uploads / size limits, and makes Gemini scans faster. Documents
// stay perfectly legible at ~1600px. PDFs and non-images pass through untouched.
export async function compressImage(file, { maxDim = 1600, quality = 0.82, skipUnder = 1.2 * 1024 * 1024 } = {}) {
  if (!file || !file.type || !file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, maxDim / longest);
    // Already small and not oversized → leave it alone.
    if (scale === 1 && file.size <= skipUnder) return file;
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file; // no gain → keep original
    const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file; // HEIC / unsupported → upload as-is
  }
}
