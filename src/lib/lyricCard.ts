/** Gambar kartu lirik 1080×1350 (rasio feed/story) dengan warna dari sampul lagu */
import type { Track } from './types';
import { artistNames } from './format';
import { img } from './img';

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.referrerPolicy = 'no-referrer';
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
    setTimeout(() => res(null), 5000);
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(/\s+/)) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > max && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

export async function renderLyricCard(track: Track, lines: string[], tint: string): Promise<Blob> {
  const W = 1080, H = 1350, P = 96;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,.35)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // header: sampul + judul
  const cover = await loadImg(img(track.thumbnail, 240));
  const cs = 132;
  if (cover) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(P, P, cs, cs, 14);
    ctx.clip();
    try { ctx.drawImage(cover, P, P, cs, cs); } catch { /* gambar lintas-domain */ }
    ctx.restore();
  }
  const tx = cover ? P + cs + 32 : P;
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
  ctx.fillStyle = '#fff';
  ctx.font = `700 42px ${font}`;
  ctx.textBaseline = 'top';
  const title = wrap(ctx, track.title, W - tx - P)[0] || '';
  ctx.fillText(title, tx, P + 26);
  ctx.fillStyle = 'rgba(255,255,255,.72)';
  ctx.font = `500 34px ${font}`;
  ctx.fillText(wrap(ctx, artistNames(track), W - tx - P)[0] || '', tx, P + 80);

  // baris lirik
  let size = 76;
  let rows: string[] = [];
  const area = H - (P + cs + 90) - 190;
  for (; size >= 44; size -= 4) {
    ctx.font = `800 ${size}px ${font}`;
    rows = lines.flatMap((l) => wrap(ctx, l, W - P * 2));
    if (rows.length * size * 1.22 <= area) break;
  }
  const top = P + cs + 90 + Math.max(0, (area - rows.length * size * 1.22) / 2);
  ctx.fillStyle = '#fff';
  rows.forEach((r, i) => ctx.fillText(r, P, top + i * size * 1.22));

  // kaki
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.font = `700 30px ${font}`;
  ctx.fillText('Stream Beats', P, H - P - 30);

  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Gagal membuat gambar'))), 'image/png'));
}
