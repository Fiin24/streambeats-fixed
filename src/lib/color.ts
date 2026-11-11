import { useEffect, useState } from 'react';
import { img } from './img';

/** Warna dominan cover album (seperti latar dinamis Spotify). Hasil di-cache per URL. */
const cache = new Map<string, string>();
const DEFAULT = 'rgb(70 70 82)';

/** Warna cadangan yang stabil dari teks (dipakai bila gambar tidak mengizinkan CORS) */
export function seedColor(seed = ''): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 52% 42%)`;
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function extract(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.referrerPolicy = 'no-referrer';
    im.onload = () => {
      try {
        const N = 32;
        const c = document.createElement('canvas');
        c.width = c.height = N;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(im, 0, 0, N, N);
        const d = ctx.getImageData(0, 0, N, N).data;
        let R = 0, G = 0, B = 0, W = 0;
        for (let i = 0; i < d.length; i += 4) {
          const [, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
          if (l < 0.08 || l > 0.94) continue; // abaikan hitam/putih
          const w = 0.15 + s * s * 2; // utamakan warna yang "hidup"
          R += d[i] * w; G += d[i + 1] * w; B += d[i + 2] * w; W += w;
        }
        if (!W) return resolve(DEFAULT);
        const [h, s, l] = rgbToHsl(R / W, G / W, B / W);
        // cover monokrom tetap netral (abu-abu), cover berwarna diperkuat sedikit
        const S = (s < 0.12 ? s : Math.min(0.85, Math.max(0.3, s))) * 100;
        const L = Math.min(0.55, Math.max(0.36, l)) * 100;
        resolve(`hsl(${Math.round(h)} ${Math.round(S)}% ${Math.round(L)}%)`);
      } catch (e) {
        reject(e); // canvas tercemar (tanpa CORS)
      }
    };
    im.onerror = reject;
    im.src = src;
  });
}

export function useCoverColor(src?: string, seed = ''): string {
  const key = src || seed;
  const [color, setColor] = useState(() => (key && cache.get(key)) || (seed ? seedColor(seed) : DEFAULT));
  useEffect(() => {
    if (!key) return setColor(DEFAULT);
    const hit = cache.get(key);
    if (hit) return setColor(hit);
    let alive = true;
    const done = (c: string) => { cache.set(key, c); if (alive) setColor(c); };
    if (!src) done(seedColor(seed));
    else extract(img(src, 96)).then(done, () => done(seedColor(seed || src)));
    return () => { alive = false; };
  }, [key, src, seed]);
  return color;
}
