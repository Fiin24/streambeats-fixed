/**
 * Sumber cadangan unduhan offline (dipakai bila YouTube Music menolak unduhan langsung).
 *
 * 1. Mirror audio (Piped / Invidious / Cobalt) — meneruskan audio lewat server mereka, jadi lolos
 *    walau IP HP / server kita dianggap bot oleh YouTube. Di APK permintaan memakai HTTP native
 *    (tanpa batasan CORS); di browser memakai fetch biasa.
 * 2. "Link lain" — cari unggahan lain dari lagu yang sama (versi Topic/audio resmi, video musik,
 *    video lirik) dengan judul, artis & durasi yang cocok, lalu unduh versi itu.
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import {
  DEFAULT_MIRRORS, fetchHttp, parseCustomMirrors, resolveFromMirror, resolveFromMirrors, uniqMirrors,
  type Http, type Mirror, type MirrorStream,
} from '../../api/_lib/mirrors';
import { useSettings } from '../store/settings';
import { search } from './api';
import type { Item, Track } from './types';

const isNative = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('CapacitorHttp');
const host = (u: string) => { try { return new URL(u).host; } catch { return u; } };
const NATIVE_CHUNK = 1.5 * 1024 * 1024;
const WEB_CHUNK = 4 * 1024 * 1024;
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

/* ------------------------------- HTTP --------------------------------- */

const nativeHttp: Http = async (url, init = {}) => {
  const timeout = init.timeout ?? 9000;
  const req = CapacitorHttp.request({
    url,
    method: init.method || 'GET',
    headers: { 'User-Agent': UA, ...(init.headers || {}) },
    data: init.body,
    connectTimeout: timeout,
    readTimeout: timeout,
  });
  const r = await Promise.race([req, new Promise<never>((_, no) => setTimeout(() => no(new Error('timeout')), timeout + 1500))]);
  let data: any = r.data;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { /* bukan JSON */ } }
  return { status: r.status, data };
};

/** Catat mirror yang sering gagal di sesi ini → dicoba paling akhir */
const fails = new Map<string, number>();
let lastGood = '';
const tracked = (http: Http): Http => async (url, init) => {
  const h = host(url);
  try {
    const r = await http(url, init);
    if (r.status >= 400) fails.set(h, (fails.get(h) || 0) + 1);
    return r;
  } catch (e) {
    fails.set(h, (fails.get(h) || 0) + 1);
    throw e;
  }
};
const http = () => tracked(isNative() ? nativeHttp : fetchHttp);

/* ------------------------------ mirrors ------------------------------- */

let remote: { at: number; list: Mirror[] } | null = null;

/** Mirror: buatan pengguna (Pengaturan) → daftar terbaru dari server → bawaan */
export async function getMirrors(): Promise<Mirror[]> {
  const custom = parseCustomMirrors(useSettings.getState().dlMirrors);
  if (!remote || Date.now() - remote.at > 60 * 60 * 1000) {
    try {
      const r = await fetch('/api/yt?action=mirrors', { cache: 'no-store' });
      const j = await r.json();
      if (Array.isArray(j?.mirrors) && j.mirrors.length) remote = { at: Date.now(), list: j.mirrors };
    } catch { /* pakai bawaan */ }
  }
  const all = uniqMirrors([...custom, ...(remote?.list || DEFAULT_MIRRORS)]);
  const score = (m: Mirror) => (host(m.url) === lastGood ? -1 : 0) + (fails.get(host(m.url)) || 0);
  const customSet = new Set(custom.map((m) => m.url));
  // mirror buatan pengguna selalu dicoba duluan
  return all.sort((a, b) => Number(customSet.has(b.url)) - Number(customSet.has(a.url)) || score(a) - score(b));
}

/* ----------------------------- download ------------------------------- */

interface GetResult { status: number; bytes: Uint8Array; headers: Record<string, string> }

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getBytes(url: string, headers: Record<string, string>, signal: AbortSignal, timeout = 45_000): Promise<GetResult> {
  if (isNative()) {
    const r = await CapacitorHttp.get({ url, headers: { 'User-Agent': UA, ...headers }, responseType: 'arraybuffer', connectTimeout: 15_000, readTimeout: timeout });
    const d = r.data;
    const bytes = typeof d === 'string' ? b64ToBytes(d) : d instanceof ArrayBuffer ? new Uint8Array(d) : new Uint8Array(0);
    const h: Record<string, string> = {};
    for (const [k, v] of Object.entries(r.headers || {})) h[k.toLowerCase()] = String(v);
    return { status: r.status, bytes, headers: h };
  }
  const res = await fetch(url, { headers, signal, referrerPolicy: 'no-referrer', credentials: 'omit' });
  const h: Record<string, string> = {};
  res.headers.forEach((v, k) => { h[k.toLowerCase()] = v; });
  return { status: res.status, bytes: new Uint8Array(await res.arrayBuffer()), headers: h };
}

/** Unduh satu stream mirror (per potongan bila mendukung Range) */
async function downloadStream(s: MirrorStream, signal: AbortSignal, onProgress: (p: number) => void): Promise<Blob> {
  const abort = () => { if (signal.aborted) throw new DOMException('Dibatalkan', 'AbortError'); };
  if (!s.ranged) {
    const r = await getBytes(s.url, {}, signal, 120_000);
    abort();
    if (r.status !== 200 || r.bytes.byteLength < 10_000) throw new Error(`HTTP ${r.status}`);
    onProgress(1);
    return new Blob([r.bytes as BlobPart], { type: (r.headers['content-type'] || s.mime).split(';')[0] });
  }
  const chunk = isNative() ? NATIVE_CHUNK : WEB_CHUNK;
  const parts: Uint8Array[] = [];
  let start = 0;
  let total = s.size || Infinity;
  let errors = 0;
  while (start < total) {
    abort();
    const end = start + chunk - 1;
    let r: GetResult;
    try {
      r = await getBytes(s.url, { Range: `bytes=${start}-${Number.isFinite(total) ? Math.min(end, total - 1) : end}` }, signal);
    } catch (e: any) {
      abort();
      if (++errors > 3) throw new Error(e?.message || 'Jaringan bermasalah');
      await new Promise((ok) => setTimeout(ok, 700 * errors));
      continue;
    }
    abort();
    if (r.status !== 200 && r.status !== 206) {
      if (++errors > 2) throw new Error(`HTTP ${r.status}`);
      continue;
    }
    if (!r.bytes.byteLength) break;
    const t = Number(String(r.headers['content-range'] || '').split('/')[1]);
    if (t) total = t;
    if (r.status === 200) { // server mengabaikan Range → seluruh file sekaligus
      parts.length = 0;
      parts.push(r.bytes);
      break;
    }
    parts.push(r.bytes);
    start += r.bytes.byteLength;
    if (!Number.isFinite(total) && r.bytes.byteLength < chunk) total = start;
    errors = 0;
    onProgress(Number.isFinite(total) ? Math.min(1, start / total) : 0.5);
  }
  return new Blob(parts as BlobPart[], { type: s.mime });
}

/** Unduh audio lewat mirror cadangan. Mengembalikan blob + nama sumber. */
export async function downloadViaMirrors(videoId: string, signal: AbortSignal, onProgress: (p: number) => void): Promise<{ blob: Blob; source: string }> {
  const list = await getMirrors();
  const h = http();
  const skip: string[] = [];
  const errs: string[] = [];
  
  // Try with more attempts and better error handling
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const m = await resolveFromMirrors(list, videoId, h, { wave: isNative() ? 4 : 6, timeout: 9000, skip, signal });
      try {
        const blob = await downloadStream(m, signal, onProgress);
        if (blob.size < 10_000) throw new Error('file terlalu kecil');
        const colon = m.source.indexOf(':');
        lastGood = colon > 0 ? m.source.slice(colon + 1) : m.source; // host mirror yang berhasil → dicoba duluan
        return { blob, source: m.source };
      } catch (e: any) {
        if (signal.aborted) throw e;
        errs.push(`${m.source}: ${e?.message || 'gagal'}`);
        skip.push(m.source);
        onProgress(0);
      }
    } catch (e: any) {
      if (signal.aborted) throw e;
      errs.push(`resolve: ${e?.message || 'gagal'}`);
    }
  }
  
  // Build more informative error message
  const mirrorFailed = errs.some(e => e.includes('HTTP 403') || e.includes('HTTP 429'));
  const timeoutFailed = errs.some(e => e.includes('timeout'));
  const notFound = errs.some(e => e.includes('404') || e.includes('tidak ditemukan'));
  
  let detailedError = 'Mirror gagal';
  if (mirrorFailed) detailedError += ' · Diblokir/batas rate mirror';
  if (timeoutFailed) detailedError += ' · Timeout mirror';
  if (notFound) detailedError += ' · Lagu tidak di mirror';
  detailedError += ` (${errs.slice(0, 3).join('; ')})`;
  
  throw new Error(detailedError);
}

/** Uji semua mirror dengan satu lagu → jumlah yang aktif (untuk tombol di Pengaturan) */
export async function testMirrors(videoId = 'dQw4w9WgXcQ'): Promise<{ ok: string[]; total: number }> {
  const list = await getMirrors();
  const h = http();
  const ok: string[] = [];
  await Promise.all(list.map((m) => resolveFromMirror(m, videoId, h, 9000).then((s) => { ok.push(s.source); }, () => undefined)));
  return { ok, total: list.length };
}

/* ------------------------- link lain (versi lain) ---------------------- */

const norm = (s = '') =>
  s.toLowerCase()
    .replace(/\((official|lyric|lirik|audio|video|music|mv|visualizer|hd|hq)[^)]*\)|\[(official|lyric|lirik|audio|video|music|mv|visualizer|hd|hq)[^\]]*\]/g, ' ')
    .replace(/official (music )?video|lyric video|video lirik|official audio|audio resmi|\bmv\b/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
const words = (s: string) => new Set(norm(s).split(' ').filter((w) => w.length > 1 || /\d/.test(w)));
function overlap(a: string, b: string): number {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / A.size;
}
const VARIANT = /\b(live|cover|karaoke|remix|sped ?up|slowed|reverb|instrumental|acoustic|akustik|8d|nightcore|tiktok|version|versi|mashup|medley|drumless|no sound|minus one|backing track|tutorial|reaction|chord|kunci gitar|lesson)\b/i;

/**
 * Cari unggahan lain dari lagu yang sama. Kandidat harus cocok judul (≥ 65% kata),
 * menyebut artis yang sama (bila diketahui), durasi selisih ≤ 30 dtk, dan bukan versi live/cover/remix
 * (kecuali judul aslinya memang begitu).
 */
export async function findAlternatives(t: Track, max = 6): Promise<Track[]> {
  const artist = t.artists?.[0]?.name || (t.subtitle || '').split(/•|,/)[0].trim();
  const q = `${t.title} ${artist}`.trim();
  const res = await Promise.allSettled([search(q, 'songs'), search(q, 'videos')]);
  const seen = new Set<string>([t.videoId]);
  const cands: { item: Item; score: number }[] = [];
  const origVariant = VARIANT.test(t.title);
  const artistWords = norm(artist);
  for (const r of res) {
    if (r.status !== 'fulfilled') continue;
    for (const sec of r.value.sections) {
      for (const it of sec.items) {
        if (!it.videoId || seen.has(it.videoId)) continue;
        seen.add(it.videoId);
        const tScore = overlap(t.title, it.title);
        if (tScore < 0.65) continue; // Slightly lower threshold for more results
        if (!origVariant && VARIANT.test(it.title)) continue;
        const itArtists = norm([...(it.artists || []).map((a) => a.name), it.subtitle, it.title].join(' '));
        const aOk = !artistWords || itArtists.includes(artistWords) || overlap(artist, itArtists) >= 0.45;
        if (!aOk) continue;
        let score = tScore * 2 + (it.type === 'song' ? 0.6 : 0) + overlap(it.title, t.title) * 0.5;
        if (t.duration && it.duration) {
          const d = Math.abs(t.duration - it.duration);
          if (d > 30) continue; // Slightly higher tolerance
          score += d <= 5 ? 1 : d <= 10 ? 0.5 : 0.2;
        }
        cands.push({ item: it, score });
      }
    }
  }
  return cands
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ item }) => ({ ...item, videoId: item.videoId! }) as Track);
}
