/**
 * Sumber cadangan untuk unduhan offline bila YouTube memblokir permintaan langsung
 * ("Sign in to confirm you're not a bot").
 *
 * Mirror = front-end YouTube open-source yang mengambil audio dari YouTube lalu MENERUSKAN (proxy)
 * byte-nya lewat server mereka sendiri, sehingga URL hasilnya tidak terikat IP kita:
 *  - Piped     GET  {api}/streams/{id}                     → audioStreams[].url (lewat pipedproxy)
 *  - Invidious GET  {base}/api/v1/videos/{id}?local=true   → adaptiveFormats[].url (lewat /videoplayback instance)
 *  - Cobalt    POST {base}/  {url, downloadMode:'audio'}   → { status:'tunnel'|'redirect', url }
 *
 * Modul ini dipakai di server (Vercel/Netlify) DAN di klien (browser / APK) — semua permintaan HTTP
 * lewat fungsi `Http` yang disuntikkan, jadi di APK bisa memakai CapacitorHttp (tanpa CORS).
 * Daftar instance publik sering berubah; daftar terbaru diambil otomatis dari direktori resminya.
 */

export type MirrorKind = 'piped' | 'invidious' | 'cobalt';
export interface Mirror { kind: MirrorKind; url: string }
export interface MirrorStream { url: string; mime: string; size: number; source: string; ranged: boolean }

export interface HttpResult { status: number; data: any }
/** GET/POST JSON; harus melempar error bila jaringan gagal / timeout */
export type Http = (url: string, init?: { method?: 'GET' | 'POST'; body?: unknown; headers?: Record<string, string>; timeout?: number }) => Promise<HttpResult>;

/** Cadangan bila direktori instance tidak bisa dihubungi */
export const DEFAULT_MIRRORS: Mirror[] = [
  { kind: 'piped', url: 'https://pipedapi.kavin.rocks' },
  { kind: 'piped', url: 'https://api.piped.private.coffee' },
  { kind: 'piped', url: 'https://pipedapi.ducks.party' },
  { kind: 'piped', url: 'https://pipedapi.adminforge.de' },
  { kind: 'piped', url: 'https://pipedapi.reallyaweso.me' },
  { kind: 'piped', url: 'https://pipedapi.leptons.xyz' },
  { kind: 'invidious', url: 'https://inv.nadeko.net' },
  { kind: 'invidious', url: 'https://invidious.nerdvpn.de' },
  { kind: 'invidious', url: 'https://yewtu.be' },
  { kind: 'invidious', url: 'https://invidious.f5.si' },
];

const clean = (u: string) => u.trim().replace(/\/+$/, '');
const host = (u: string) => { try { return new URL(u).host; } catch { return u; } };

/**
 * Baca daftar mirror buatan pengguna (satu per baris). Awalan opsional:
 *   piped:https://…  invidious:https://…  cobalt:https://…
 * Tanpa awalan → dicoba sebagai ketiganya.
 */
export function parseCustomMirrors(text = ''): Mirror[] {
  const out: Mirror[] = [];
  for (const raw of text.split(/[\n,]+/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(piped|invidious|cobalt)\s*:\s*(https?:\/\/.+)$/i);
    if (m) { out.push({ kind: m[1].toLowerCase() as MirrorKind, url: clean(m[2]) }); continue; }
    if (/^https?:\/\//i.test(line)) for (const kind of ['piped', 'invidious', 'cobalt'] as MirrorKind[]) out.push({ kind, url: clean(line) });
  }
  return out;
}

export function uniqMirrors(list: Mirror[]): Mirror[] {
  const seen = new Set<string>();
  return list.filter((m) => { const k = `${m.kind}|${clean(m.url)}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Ambil daftar instance publik terbaru dari direktori Piped & Invidious (dipanggil di server, di-cache). */
export async function discoverMirrors(http: Http): Promise<Mirror[]> {
  const found: Mirror[] = [];
  await Promise.all([
    http('https://piped-instances.kavin.rocks/', { timeout: 6000 }).then((r) => {
      if (r.status !== 200 || !Array.isArray(r.data)) return;
      const ok = r.data
        .filter((i: any) => i?.api_url && (i.uptime_24h ?? 100) >= 80)
        .sort((a: any, b: any) => (b.uptime_24h || 0) - (a.uptime_24h || 0));
      for (const i of ok.slice(0, 12)) found.push({ kind: 'piped', url: clean(i.api_url) });
    }).catch(() => undefined),
    http('https://api.invidious.io/instances.json?sort_by=health', { timeout: 6000 }).then((r) => {
      if (r.status !== 200 || !Array.isArray(r.data)) return;
      for (const [, i] of r.data as [string, any][]) {
        if (i?.type !== 'https' || !i.uri || i.api === false) continue;
        found.push({ kind: 'invidious', url: clean(i.uri) });
        if (found.filter((m) => m.kind === 'invidious').length >= 10) break;
      }
    }).catch(() => undefined),
  ]);
  return uniqMirrors([...found, ...DEFAULT_MIRRORS]);
}

const audioPref = (mime: string) => (mime.startsWith('audio/mp4') ? 2 : mime.startsWith('audio/webm') ? 1 : 0);
function best<T extends { mime: string; bitrate: number }>(list: T[]): T | undefined {
  // AAC (m4a) diputar di semua browser termasuk Safari iOS; Opus/WebM sebagai cadangan
  return [...list].sort((a, b) => audioPref(b.mime) - audioPref(a.mime) || b.bitrate - a.bitrate)[0];
}
const mimeFromName = (name = '') =>
  /\.(m4a|mp4|aac)\b/i.test(name) ? 'audio/mp4' : /\.(webm|opus|ogg)\b/i.test(name) ? 'audio/webm' : /\.mp3\b/i.test(name) ? 'audio/mpeg' : 'audio/mp4';

/** Minta alamat audio dari satu mirror. Melempar error bila mirror tidak bisa melayani. */
export async function resolveFromMirror(m: Mirror, videoId: string, http: Http, timeout = 9000): Promise<MirrorStream> {
  const base = clean(m.url);
  const source = `${m.kind}:${host(base)}`;
  if (m.kind === 'piped') {
    const r = await http(`${base}/streams/${videoId}`, { timeout });
    if (r.status !== 200 || typeof r.data !== 'object') throw new Error(`${source} HTTP ${r.status}`);
    type Fmt = { url: string; mime: string; bitrate: number; size: number };
    const list: Fmt[] = (r.data?.audioStreams || [])
      .filter((s: any) => s?.url && String(s.mimeType || '').startsWith('audio/'))
      .map((s: any): Fmt => ({ url: String(s.url), mime: String(s.mimeType).split(';')[0], bitrate: Number(s.bitrate) || 0, size: Number(s.contentLength) || 0 }));
    const b = best(list);
    if (!b) throw new Error(`${source}: ${r.data?.error || r.data?.message || 'tidak ada audio'}`);
    return { url: b.url, mime: b.mime, size: b.size, source, ranged: true };
  }
  if (m.kind === 'invidious') {
    const r = await http(`${base}/api/v1/videos/${videoId}?local=true&fields=adaptiveFormats,error`, { timeout });
    if (r.status !== 200 || typeof r.data !== 'object') throw new Error(`${source} HTTP ${r.status}`);
    type Fmt = { url: string; mime: string; bitrate: number; size: number; itag: number };
    const list: Fmt[] = (r.data?.adaptiveFormats || [])
      .filter((f: any) => f?.url && String(f.type || '').startsWith('audio/'))
      .map((f: any): Fmt => ({ url: new URL(String(f.url), `${base}/`).toString(), mime: String(f.type).split(';')[0], bitrate: Number(f.bitrate) || 0, size: Number(f.clen) || 0, itag: Number(f.itag) }));
    const b = list.find((f) => f.itag === 140) || best(list);
    if (!b) throw new Error(`${source}: ${r.data?.error || 'tidak ada audio'}`);
    return { url: b.url, mime: b.mime, size: b.size, source, ranged: true };
  }
  // cobalt
  const r = await http(`${base}/`, {
    method: 'POST',
    timeout,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: { url: `https://www.youtube.com/watch?v=${videoId}`, downloadMode: 'audio', audioFormat: 'best' },
  });
  const st = r.data?.status;
  if (r.status !== 200 || !(st === 'tunnel' || st === 'redirect' || st === 'stream') || !r.data?.url)
    throw new Error(`${source}: ${r.data?.error?.code || r.data?.text || `HTTP ${r.status}`}`);
  return { url: String(r.data.url), mime: mimeFromName(r.data.filename), size: 0, source, ranged: false };
}

/**
 * Coba banyak mirror SEKALIGUS (paralel, per gelombang) dan kembalikan yang pertama berhasil.
 * Gelombang membatasi jumlah permintaan bersamaan agar tidak membanjiri jaringan HP.
 */
export async function resolveFromMirrors(
  mirrors: Mirror[], videoId: string, http: Http,
  opts: { wave?: number; timeout?: number; skip?: string[]; signal?: AbortSignal } = {},
): Promise<MirrorStream> {
  const wave = opts.wave ?? 5;
  const list = mirrors.filter((m) => !opts.skip?.includes(`${m.kind}:${host(m.url)}`));
  const reasons: string[] = [];
  for (let i = 0; i < list.length; i += wave) {
    if (opts.signal?.aborted) throw new Error('Dibatalkan');
    const batch = list.slice(i, i + wave);
    try {
      return await new Promise<MirrorStream>((resolve, reject) => {
        let left = batch.length;
        for (const m of batch) {
          resolveFromMirror(m, videoId, http, opts.timeout).then(resolve, (e) => {
            reasons.push(String(e?.message || e).slice(0, 80));
            if (--left === 0) reject(new Error('gelombang gagal'));
          });
        }
      });
    } catch { /* lanjut gelombang berikutnya */ }
  }
  throw new Error(`Mirror gagal (${reasons.slice(0, 4).join('; ') || 'tidak ada mirror'})`);
}

/** Http berbasis fetch (server Node 18+ & browser untuk mirror yang mengizinkan CORS) */
export const fetchHttp: Http = async (url, init = {}) => {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), init.timeout ?? 9000);
  try {
    const res = await fetch(url, {
      method: init.method || 'GET',
      headers: init.headers,
      body: init.body != null ? JSON.stringify(init.body) : undefined,
      signal: ac.signal,
    });
    const txt = await res.text();
    let data: any = txt;
    try { data = JSON.parse(txt); } catch { /* bukan JSON */ }
    return { status: res.status, data };
  } finally {
    clearTimeout(t);
  }
};
