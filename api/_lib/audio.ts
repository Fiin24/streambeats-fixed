/**
 * Unduh audio untuk diputar offline.
 * Alamat stream diambil lewat InnerTube /player memakai klien yang memberi URL langsung
 * (ANDROID_VR, cadangan IOS) — tanpa perlu dekripsi signature.
 * URL googlevideo terikat ke IP server, jadi byte audio diteruskan lewat fungsi ini
 * per potongan (≤ 3,5 MB) agar tetap di bawah batas respons Vercel (4,5 MB).
 */
import { DEFAULT_MIRRORS, discoverMirrors, fetchHttp, resolveFromMirrors, type Mirror } from './mirrors.js';

const PLAYER = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const MIRROR_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

/** Daftar mirror publik (Piped/Invidious) — di-cache 6 jam per instance fungsi */
let mirrorCache: { at: number; list: Mirror[] } | null = null;
export async function serverMirrors(): Promise<Mirror[]> {
  if (mirrorCache && Date.now() - mirrorCache.at < 6 * 60 * 60 * 1000) return mirrorCache.list;
  const list = await Promise.race([
    discoverMirrors(fetchHttp),
    new Promise<Mirror[]>((ok) => setTimeout(() => ok(DEFAULT_MIRRORS), 3000)),
  ]);
  mirrorCache = { at: Date.now(), list };
  return list;
}

interface Client { name: string; id: string; ua: string; ctx: Record<string, unknown> }
const CLIENTS: Client[] = [
  {
    name: 'ANDROID_VR',
    id: '28',
    ua: 'com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    ctx: { clientName: 'ANDROID_VR', clientVersion: '1.62.27', deviceMake: 'Oculus', deviceModel: 'Quest 3', osName: 'Android', osVersion: '12L', androidSdkVersion: 32 },
  },
  {
    name: 'ANDROID',
    id: '3',
    ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
    ctx: { clientName: 'ANDROID', clientVersion: '20.10.38', osName: 'Android', osVersion: '11', androidSdkVersion: 30 },
  },
  {
    name: 'IOS',
    id: '5',
    ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
    ctx: { clientName: 'IOS', clientVersion: '20.10.4', deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.3.2.22D82' },
  },
];

export interface Resolved { url: string; mime: string; size: number; ua: string; client: string; itag: number; exp: number }

/** Cache per instance fungsi (URL berlaku ±6 jam; kita pakai 1 jam) */
const cache = new Map<string, Resolved>();
export const MAX_CHUNK = 3.5 * 1024 * 1024;
export const isVideoId = (id?: string): id is string => !!id && /^[\w-]{11}$/.test(id);

function pickFormat(formats: any[]): any | undefined {
  const audio = formats.filter((f) => typeof f.mimeType === 'string' && f.mimeType.startsWith('audio/') && f.url);
  // AAC (m4a) diputar di semua browser termasuk Safari iOS; Opus/WebM sebagai cadangan
  return (
    audio.find((f) => f.itag === 140) ||
    audio.filter((f) => f.mimeType.startsWith('audio/mp4')).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0] ||
    audio.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0]
  );
}

export async function resolveAudio(videoId: string, skip: string[] = []): Promise<Resolved> {
  const hit = cache.get(videoId);
  if (hit && hit.exp > Date.now() && !skip.includes(hit.client)) return hit;
  const reasons: string[] = [];
  for (const c of CLIENTS) {
    if (skip.includes(c.name)) continue;
    try {
      const res = await fetch(PLAYER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': c.ua, 'X-YouTube-Client-Name': c.id, 'X-YouTube-Client-Version': String(c.ctx.clientVersion) },
        body: JSON.stringify({ context: { client: { ...c.ctx, hl: 'en', gl: 'US' } }, videoId, contentCheckOk: true, racyCheckOk: true }),
      });
      if (!res.ok) { reasons.push(`${c.name}: HTTP ${res.status}`); continue; }
      const j: any = await res.json();
      const st = j?.playabilityStatus?.status;
      if (st !== 'OK') { reasons.push(`${c.name}: ${j?.playabilityStatus?.reason || st || 'tidak tersedia'}`); continue; }
      const f = pickFormat(j?.streamingData?.adaptiveFormats || []);
      if (!f) { reasons.push(`${c.name}: tidak ada format audio`); continue; }
      const r: Resolved = {
        url: f.url, mime: String(f.mimeType).split(';')[0], size: Number(f.contentLength) || 0,
        ua: c.ua, client: c.name, itag: f.itag, exp: Date.now() + 60 * 60 * 1000,
      };
      cache.set(videoId, r);
      if (cache.size > 300) cache.delete(cache.keys().next().value as string);
      return r;
    } catch (e: any) {
      reasons.push(`${c.name}: ${e?.message || 'gagal'}`);
    }
  }
  // YouTube menolak IP server → coba mirror (Piped/Invidious) yang meneruskan audio lewat server mereka
  try {
    // satu gelombang paralel (≤ 5 dtk) agar tetap di bawah batas waktu fungsi Vercel/Netlify (10 dtk)
    const mirrors = (await serverMirrors()).filter((m) => m.kind !== 'cobalt').slice(0, 8);
    const m = await resolveFromMirrors(mirrors, videoId, fetchHttp, { wave: 8, timeout: 5000, skip });
    if (m.ranged) {
      const r: Resolved = { url: m.url, mime: m.mime, size: m.size, ua: MIRROR_UA, client: m.source, itag: 0, exp: Date.now() + 30 * 60 * 1000 };
      cache.set(videoId, r);
      return r;
    }
  } catch (e: any) {
    reasons.push(e?.message || 'mirror gagal');
  }
  const all = reasons.join('; ');
  if (/not a bot|sign in|login_required/i.test(all))
    throw new Error('Diblokir YouTube (server dianggap bot) & mirror cadangan tidak tersedia');
  throw new Error(`Audio tidak bisa diambil (${all || 'tidak ada klien'})`);
}

export interface Chunk { body: Uint8Array; total: number; mime: string; start: number; end: number; source: string }

/** Ambil satu potongan audio [start, end] (inklusif) */
export async function fetchChunk(videoId: string, start: number, end?: number): Promise<Chunk> {
  const skip: string[] = [];
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await resolveAudio(videoId, skip);
    let e = end ?? start + MAX_CHUNK - 1;
    if (e - start + 1 > MAX_CHUNK) e = start + MAX_CHUNK - 1;
    if (r.size) e = Math.min(e, r.size - 1);
    if (r.size && start >= r.size) return { body: new Uint8Array(0), total: r.size, mime: r.mime, start, end: start - 1, source: r.client };
    const res = await fetch(r.url, { headers: { Range: `bytes=${start}-${e}`, 'User-Agent': r.ua } });
    if (res.status === 200 || res.status === 206) {
      const body = new Uint8Array(await res.arrayBuffer());
      const cr = res.headers.get('content-range'); // bytes a-b/total
      const total = Number(cr?.split('/')[1]) || r.size || body.byteLength;
      return { body, total, mime: r.mime, start, end: start + body.byteLength - 1, source: r.client };
    }
    // URL kedaluwarsa / ditolak → ambil ulang dengan klien lain
    lastErr = `HTTP ${res.status}`;
    cache.delete(videoId);
    skip.push(r.client);
  }
  throw new Error(`Gagal mengunduh audio (${lastErr})`);
}

export interface DlResult { status: number; headers: Record<string, string>; body: Uint8Array | string }

/** Handler bersama untuk Vercel, Netlify & server dev Vite: /api/dl?id=VIDEO_ID&start=0&end=3670015 */
export async function handleDl(q: Record<string, string | undefined>): Promise<DlResult> {
  const json = (status: number, o: unknown): DlResult => ({ status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(o) });
  if (!isVideoId(q.id)) return json(400, { error: 'Parameter id tidak valid' });
  const start = Math.max(0, Number(q.start) || 0);
  const end = q.end != null && q.end !== '' ? Number(q.end) : undefined;
  if (end != null && (!Number.isFinite(end) || end < start)) return json(400, { error: 'Rentang tidak valid' });
  try {
    if (q.info) {
      const r = await resolveAudio(q.id);
      return json(200, { mime: r.mime, size: r.size, itag: r.itag, source: r.client });
    }
    const c = await fetchChunk(q.id, start, end);
    return {
      status: 200,
      headers: {
        'Content-Type': c.mime,
        'Cache-Control': 'no-store',
        'X-Total-Length': String(c.total),
        'X-Range': `${c.start}-${c.end}`,
        'X-Source': c.source,
        'Access-Control-Expose-Headers': 'X-Total-Length, X-Range, X-Source',
      },
      body: c.body,
    };
  } catch (e: any) {
    return json(502, { error: e?.message || 'Gagal mengunduh audio' });
  }
}
