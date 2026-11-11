/**
 * Kompres foto profil di perangkat sebelum diunggah: potong tengah jadi persegi, ubah ke 320×320 JPEG.
 * Hasilnya kecil (±15–40 KB) sehingga hemat kuota & database.
 */
export async function squareAvatar(file: File, size = 320, quality = 0.85): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Pilih file gambar (JPG, PNG, WEBP)');
  if (file.size > 15 * 1024 * 1024) throw new Error('Foto terlalu besar (maks. 15 MB)');
  const src = await loadImage(file);
  const w = src.width, h = src.height;
  const side = Math.min(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Browser tidak mendukung pengolahan foto');
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(src as CanvasImageSource, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
  if ('close' in src && typeof (src as ImageBitmap).close === 'function') (src as ImageBitmap).close();
  let out = canvas.toDataURL('image/jpeg', quality);
  // jaga-jaga untuk foto yang sangat detail
  for (let q = quality - 0.1; out.length > 190_000 && q > 0.4; q -= 0.1) out = canvas.toDataURL('image/jpeg', q);
  return out;
}

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap mengikuti orientasi EXIF (foto kamera HP tidak miring)
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions); } catch { /* cadangan di bawah */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('Foto tidak bisa dibaca'));
      im.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
