/**
 * Dengar bersama (v4.4) — ruangan real time: host memutar lagu, tamu ikut di detik yang sama.
 *
 * Tanpa WebSocket (Vercel/Netlify Functions tidak mendukung koneksi panjang) → klien melakukan polling ringan
 * (tamu ±2 dtk, host ±3 dtk) dan semua status disimpan di Upstash Redis yang sama dengan akun
 * (UPSTASH_REDIS_REST_URL/TOKEN atau KV_REST_API_URL/TOKEN). Satu request = satu panggilan pipeline ke Redis.
 *
 * Kunci (kedaluwarsa otomatis 6 jam sejak update terakhir host):
 *   lt:{KODE}:meta  JSON  { hostName, hostKey, hostDev, created, settings }
 *   lt:{KODE}:pb    JSON  { track, playing, pos, rate, volume, ts, seq }   ← status pemutar host
 *   lt:{KODE}:m     HASH  memberId → { id, name, dev, key, status, joinedAt, seen }
 *   lt:{KODE}:s     HASH  sid → { id, by, byName, track, at }               ← saran lagu dari tamu
 *   lt:{KODE}:q     JSON  { v, queue, history }                            ← antrean berikutnya & riwayat ruangan (dikirim host saat berubah)
 *
 * Kunci rahasia host/tamu (hostKey/memberKey) hanya dikirim ke pemiliknya dan tidak pernah ikut di URL.
 */
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

type Env = Record<string, string | undefined>;
type Cmd = (string | number)[];
export interface TogetherReq { method: string; action: string; body: any }
export interface TogetherRes { status: number; body: unknown }
export interface TogetherOpts { dev?: boolean; env?: Env }

const TTL = 6 * 3600;
const MAX_MEMBERS = 20;
const MAX_SUGGESTIONS = 30;
const MAX_QUEUE = 30;
const MAX_HISTORY = 100;
const SEEN_EVERY = 8_000; // tamu memperbarui "terakhir terlihat" paling sering tiap 8 dtk
const ONLINE_MS = 25_000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tanpa 0/O/1/I agar mudah diketik

// ───────────────────────────── penyimpanan ─────────────────────────────
interface Store { pipe(cmds: Cmd[]): Promise<any[]> }

function upstash(url: string, token: string): Store {
  const base = url.replace(/\/$/, '');
  return {
    async pipe(cmds) {
      const r = await fetch(`${base}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cmds),
      });
      const j: any = await r.json().catch(() => null);
      if (!r.ok || !Array.isArray(j)) throw new Error(`Database: ${(j && j.error) || r.status}`);
      return j.map((x: any) => {
        if (x?.error) throw new Error(`Database: ${x.error}`);
        return x?.result;
      });
    },
  };
}

/** Penyimpanan memori untuk `npm run dev` / `preview` (hilang saat server dimatikan) */
const memKV = new Map<string, { v: string | Map<string, string>; exp: number }>();
const live = (k: string) => {
  const e = memKV.get(k);
  if (e && e.exp && e.exp < Date.now()) { memKV.delete(k); return undefined; }
  return e;
};
const hash = (k: string, create = false) => {
  const e = live(k);
  if (e && e.v instanceof Map) return e.v;
  if (!create) return undefined;
  const m = new Map<string, string>();
  memKV.set(k, { v: m, exp: e?.exp || 0 });
  return m;
};
function memExec(c: Cmd): any {
  const [op, k, ...a] = c.map(String);
  switch (op.toUpperCase()) {
    case 'GET': { const e = live(k); return e && typeof e.v === 'string' ? e.v : null; }
    case 'SET': {
      const nx = a.includes('NX');
      const exI = a.indexOf('EX');
      if (nx && live(k)) return null;
      memKV.set(k, { v: a[0], exp: exI > 0 ? Date.now() + Number(a[exI + 1]) * 1000 : 0 });
      return 'OK';
    }
    case 'DEL': { let n = 0; for (const key of [k, ...a]) if (memKV.delete(key)) n++; return n; }
    case 'EXPIRE': { const e = live(k); if (!e) return 0; e.exp = Date.now() + Number(a[0]) * 1000; return 1; }
    case 'HSET': { const m = hash(k, true)!; for (let i = 0; i < a.length; i += 2) m.set(a[i], a[i + 1]); return 1; }
    case 'HGET': return hash(k)?.get(a[0]) ?? null;
    case 'HDEL': { const m = hash(k); let n = 0; for (const f of a) if (m?.delete(f)) n++; return n; }
    case 'HLEN': return hash(k)?.size || 0;
    case 'HGETALL': { const m = hash(k); return m ? [...m.entries()].flat() : []; }
    default: throw new Error(`memori: perintah ${op} tidak didukung`);
  }
}
const memoryStore: Store = { async pipe(cmds) { return cmds.map(memExec); } };

function store(o: TogetherOpts): Store | null {
  const env = { ...process.env, ...(o.env || {}) };
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const tok = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (url && tok) return upstash(url, tok);
  return o.dev || env.AUTH_DEV === '1' ? memoryStore : null;
}

// ───────────────────────────── utilitas ─────────────────────────────
class HttpError extends Error { constructor(public status: number, message: string, public extra?: Record<string, unknown>) { super(message); } }
const K = (code: string) => ({ meta: `lt:${code}:meta`, pb: `lt:${code}:pb`, m: `lt:${code}:m`, s: `lt:${code}:s`, q: `lt:${code}:q` });
const parse = <T,>(s: unknown): T | null => { if (typeof s !== 'string') return null; try { return JSON.parse(s) as T; } catch { return null; } };
const hgetall = <T,>(arr: unknown): T[] => {
  const out: T[] = [];
  if (Array.isArray(arr)) for (let i = 1; i < arr.length; i += 2) { const v = parse<T>(arr[i]); if (v) out.push(v); }
  return out;
};
const token = () => randomBytes(18).toString('base64url');
const id = () => randomBytes(6).toString('base64url');
const safeEq = (a: unknown, b: unknown) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const normCode = (c: unknown) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
const cleanName = (n: unknown) => {
  const s = String(n || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  if (s.length < 2) throw new HttpError(400, 'Username minimal 2 karakter', { field: 'name' });
  return s;
};
const normName = (n: unknown) => String(n || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24).toLowerCase();
const cleanDev = (d: unknown) => String(d || '').replace(/[^\w-]/g, '').slice(0, 40);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const num = (v: unknown, def: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

/** Data lagu seperlunya (tidak percaya isi dari klien) */
function cleanTrack(t: any) {
  if (!t || typeof t !== 'object' || typeof t.videoId !== 'string' || !/^[\w-]{11}$/.test(t.videoId)) return null;
  const artists = Array.isArray(t.artists)
    ? t.artists.slice(0, 5).map((a: any) => ({ name: str(a?.name, 80) || '', id: str(a?.id, 64) })).filter((a: any) => a.name)
    : [];
  const thumb = str(t.thumbnail, 600);
  return {
    type: 'song', id: t.videoId, videoId: t.videoId,
    title: str(t.title, 200) || 'Tanpa judul',
    subtitle: str(t.subtitle, 200),
    artists,
    album: t.album && typeof t.album === 'object' ? { name: str(t.album.name, 120) || '', id: str(t.album.id, 64) } : undefined,
    thumbnail: thumb && /^https:\/\//.test(thumb) ? thumb : `https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg`,
    duration: typeof t.duration === 'number' ? num(t.duration, 0, 0, 36_000) : undefined,
    durationText: str(t.durationText, 12),
    explicit: !!t.explicit,
  };
}
const cleanTracks = (a: unknown, max: number) => (Array.isArray(a) ? a.slice(0, max).map(cleanTrack).filter(Boolean) : []);
function cleanSettings(s: any) {
  return { autoJoin: !!s?.autoJoin, autoSuggest: !!s?.autoSuggest, syncVolume: s?.syncVolume !== false };
}

/** handoff: host dipindahkan ke tamu → tamu tsb. menerima hostKey baru pada polling berikutnya */
interface Meta { hostName: string; hostKey: string; hostDev: string; created: number; settings: ReturnType<typeof cleanSettings>; handoff?: { memberId: string; memberKey: string; hostKey: string; at: number } }
interface Member { id: string; name: string; dev: string; key: string; status: 'pending' | 'approved' | 'rejected' | 'kicked'; joinedAt: number; seen: number }
interface Suggestion { id: string; by: string; byName: string; track: ReturnType<typeof cleanTrack>; at: number }

const publicMember = (m: Member, now: number) => ({ id: m.id, name: m.name, dev: m.dev, status: m.status, joinedAt: m.joinedAt, online: now - m.seen < ONLINE_MS });

async function loadMeta(db: Store, code: string) {
  if (!code) throw new HttpError(400, 'Kode sesi wajib diisi', { field: 'code' });
  const [raw] = await db.pipe([['GET', K(code).meta]]);
  const meta = parse<Meta>(raw);
  if (!meta) throw new HttpError(404, 'Sesi tidak ditemukan atau sudah berakhir', { closed: true });
  return meta;
}
async function asHost(db: Store, b: any) {
  const code = normCode(b.code);
  const meta = await loadMeta(db, code);
  if (!safeEq(b.key, meta.hostKey)) throw new HttpError(403, 'Bukan host sesi ini');
  return { code, meta };
}
async function asGuest(db: Store, b: any) {
  const code = normCode(b.code);
  const k = K(code);
  const [rawMeta, rawPb, rawMe, all, rawQ] = await db.pipe([['GET', k.meta], ['GET', k.pb], ['HGET', k.m, String(b.memberId || '')], ['HGETALL', k.m], ['GET', k.q]]);
  const meta = parse<Meta>(rawMeta);
  if (!meta) throw new HttpError(404, 'Sesi sudah diakhiri host', { closed: true });
  const q = parse<{ v: string; queue: unknown[]; history: unknown[] }>(rawQ);
  const h = meta.handoff;
  if (h && h.memberId === String(b.memberId || '') && safeEq(b.key, h.memberKey))
    throw new HttpError(409, 'Kamu sekarang host ruangan ini', { promoted: true, hostKey: h.hostKey, hostName: meta.hostName, q });
  const me = parse<Member>(rawMe);
  if (!me || !safeEq(b.key, me.key)) throw new HttpError(403, 'Kamu sudah tidak ada di sesi ini', { kicked: true });
  return { code, k, meta, me, pb: parse<any>(rawPb), members: hgetall<Member>(all), q };
}

// ───────────────────────────── aksi ─────────────────────────────
async function run(db: Store, action: string, b: any): Promise<unknown> {
  const now = Date.now();
  switch (action) {
    case 'create': {
      const hostName = cleanName(b.name);
      const hostKey = token();
      const meta: Meta = { hostName, hostKey, hostDev: cleanDev(b.dev), created: now, settings: cleanSettings(b.settings) };
      for (let i = 0; i < 8; i++) {
        const code = Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
        const [ok] = await db.pipe([['SET', K(code).meta, JSON.stringify(meta), 'NX', 'EX', TTL]]);
        if (ok === 'OK') return { code, hostKey, hostName, now };
      }
      throw new HttpError(503, 'Gagal membuat ruangan, coba lagi');
    }

    case 'join': {
      const code = normCode(b.code);
      if (code.length < 4) throw new HttpError(400, 'Kode sesi tidak valid', { field: 'code' });
      const hostName = normName(b.hostName);
      if (hostName.length < 2) throw new HttpError(400, 'Isi username host', { field: 'hostName' });
      const name = cleanName(b.name);
      const dev = cleanDev(b.dev);
      const k = K(code);
      const [rawMeta, all] = await db.pipe([['GET', k.meta], ['HGETALL', k.m]]);
      const meta = parse<Meta>(rawMeta);
      if (!meta) throw new HttpError(404, 'Sesi tidak ditemukan. Periksa lagi kodenya', { field: 'code' });
      if (normName(meta.hostName) !== hostName) throw new HttpError(403, 'Username host dan kode sesi tidak cocok', { field: 'hostName' });
      if (dev && dev === meta.hostDev) throw new HttpError(400, 'Kamu adalah host sesi ini');
      const members = hgetall<Member>(all);
      // perangkat yang sama bergabung lagi (mis. aplikasi dibuka ulang) → ganti entri lama
      const old = dev ? members.find((m) => m.dev === dev) : undefined;
      if (old?.status === 'kicked') throw new HttpError(403, 'Kamu dikeluarkan dari sesi ini oleh host');
      const active = members.filter((m) => m.id !== old?.id && (m.status === 'approved' || m.status === 'pending'));
      if (active.length >= MAX_MEMBERS) throw new HttpError(409, `Ruangan penuh (maks. ${MAX_MEMBERS} tamu)`);
      const me: Member = {
        id: id(), name, dev, key: token(),
        status: meta.settings.autoJoin || old?.status === 'approved' ? 'approved' : 'pending',
        joinedAt: now, seen: now,
      };
      const cmds: Cmd[] = [['HSET', k.m, me.id, JSON.stringify(me)], ['EXPIRE', k.m, TTL]];
      if (old) cmds.unshift(['HDEL', k.m, old.id]);
      await db.pipe(cmds);
      return { memberId: me.id, memberKey: me.key, status: me.status, hostName: meta.hostName, code, now };
    }

    case 'poll': {
      if (b.role === 'host') {
        const { code } = await asHost(db, b);
        const k = K(code);
        const [all, sugg] = await db.pipe([['HGETALL', k.m], ['HGETALL', k.s]]);
        return {
          now,
          members: hgetall<Member>(all).filter((m) => m.status === 'approved' || m.status === 'pending').map((m) => publicMember(m, now)),
          suggestions: hgetall<Suggestion>(sugg).sort((x, y) => x.at - y.at),
        };
      }
      const { k, meta, me, pb, members, q } = await asGuest(db, b);
      if (now - me.seen > SEEN_EVERY && me.status !== 'kicked' && me.status !== 'rejected') {
        me.seen = now;
        await db.pipe([['HSET', k.m, me.id, JSON.stringify(me)]]);
      }
      const ok = me.status === 'approved';
      return {
        now,
        status: me.status,
        hostName: meta.hostName,
        settings: { syncVolume: meta.settings.syncVolume },
        playback: ok ? pb : null,
        // antrean & riwayat hanya dikirim bila versinya berbeda dari milik tamu (hemat kuota)
        q: ok && q && q.v !== b.qv ? q : undefined,
        members: ok ? members.filter((m) => m.status === 'approved').map((m) => ({ id: m.id, name: m.name, online: now - m.seen < ONLINE_MS })) : [],
      };
    }

    case 'update': {
      const { code, meta } = await asHost(db, b);
      const k = K(code);
      const cmds: Cmd[] = [];
      let metaDirty = false;
      if (b.settings) { meta.settings = cleanSettings(b.settings); metaDirty = true; }
      if (meta.handoff) { delete meta.handoff; metaDirty = true; } // host baru sudah aktif
      cmds.push(metaDirty ? ['SET', k.meta, JSON.stringify(meta), 'EX', TTL] : ['EXPIRE', k.meta, TTL]);
      if (b.q && typeof b.q === 'object') {
        const q = { v: str(b.q.v, 40) || String(now), queue: cleanTracks(b.q.queue, MAX_QUEUE), history: cleanTracks(b.q.history, MAX_HISTORY) };
        cmds.push(['SET', k.q, JSON.stringify(q), 'EX', TTL]);
      } else cmds.push(['EXPIRE', k.q, TTL]);
      if (b.playback) {
        const p = b.playback;
        const pb = {
          track: cleanTrack(p.track),
          playing: !!p.playing,
          pos: num(p.pos, 0, 0, 36_000),
          rate: num(p.rate, 1, 0.25, 3),
          volume: p.volume == null ? null : num(p.volume, 0.8, 0, 1),
          ts: now,
          seq: num(p.seq, 0, 0, Number.MAX_SAFE_INTEGER),
        };
        cmds.push(['SET', k.pb, JSON.stringify(pb), 'EX', TTL]);
      } else cmds.push(['EXPIRE', k.pb, TTL]);
      cmds.push(['EXPIRE', k.m, TTL], ['EXPIRE', k.s, TTL]);
      await db.pipe(cmds);
      return { ok: true, now };
    }

    case 'member': {
      const { code } = await asHost(db, b);
      const k = K(code);
      const [raw] = await db.pipe([['HGET', k.m, String(b.memberId || '')]]);
      const m = parse<Member>(raw);
      if (!m) throw new HttpError(404, 'Tamu sudah keluar');
      const op = String(b.op);
      if (op === 'approve') m.status = 'approved';
      else if (op === 'reject') m.status = 'rejected';
      else if (op === 'kick') m.status = 'kicked';
      else throw new HttpError(400, 'Aksi tidak dikenal');
      await db.pipe([['HSET', k.m, m.id, JSON.stringify(m)]]);
      return { ok: true, now };
    }

    case 'transfer': {
      const { code, meta } = await asHost(db, b);
      const k = K(code);
      const [raw] = await db.pipe([['HGET', k.m, String(b.memberId || '')]]);
      const m = parse<Member>(raw);
      if (!m || m.status !== 'approved') throw new HttpError(404, 'Tamu tidak ditemukan di ruangan');
      if (now - m.seen > ONLINE_MS) throw new HttpError(409, `${m.name} sedang tidak aktif — pilih tamu yang online`);
      // host lama menjadi tamu biasa (langsung disetujui)
      const old: Member = { id: id(), name: meta.hostName, dev: meta.hostDev, key: token(), status: 'approved', joinedAt: now, seen: now };
      const hostKey = token();
      const next: Meta = { ...meta, hostName: m.name, hostKey, hostDev: m.dev, handoff: { memberId: m.id, memberKey: m.key, hostKey, at: now } };
      await db.pipe([['SET', k.meta, JSON.stringify(next), 'EX', TTL], ['HDEL', k.m, m.id], ['HSET', k.m, old.id, JSON.stringify(old)], ['EXPIRE', k.m, TTL]]);
      return { ok: true, memberId: old.id, memberKey: old.key, hostName: m.name, now };
    }

    case 'suggest': {
      const { k, me } = await asGuest(db, b);
      if (me.status !== 'approved') throw new HttpError(403, 'Tunggu host menyetujui permintaan bergabung');
      const track = cleanTrack(b.track);
      if (!track) throw new HttpError(400, 'Lagu tidak valid');
      const [n] = await db.pipe([['HLEN', k.s]]);
      if (Number(n) >= MAX_SUGGESTIONS) throw new HttpError(429, 'Terlalu banyak saran yang belum ditanggapi host');
      const sg: Suggestion = { id: id(), by: me.id, byName: me.name, track, at: now };
      await db.pipe([['HSET', k.s, sg.id, JSON.stringify(sg)], ['EXPIRE', k.s, TTL]]);
      return { ok: true, id: sg.id, now };
    }

    case 'suggestion': {
      const { code } = await asHost(db, b);
      await db.pipe([['HDEL', K(code).s, String(b.sid || '')]]);
      return { ok: true, now };
    }

    case 'leave': {
      const code = normCode(b.code);
      const k = K(code);
      const [raw] = await db.pipe([['HGET', k.m, String(b.memberId || '')]]);
      const me = parse<Member>(raw);
      // tamu yang dikeluarkan tetap dicatat agar tidak bisa langsung bergabung lagi
      if (me && safeEq(b.key, me.key) && me.status !== 'kicked') await db.pipe([['HDEL', k.m, me.id]]);
      return { ok: true, now };
    }

    case 'close': {
      const { code } = await asHost(db, b);
      const k = K(code);
      await db.pipe([['DEL', k.meta, k.pb, k.m, k.s, k.q]]);
      return { ok: true, now };
    }

    default:
      throw new HttpError(404, 'Aksi tidak dikenal');
  }
}

export async function handleTogether(r: TogetherReq, o: TogetherOpts = {}): Promise<TogetherRes> {
  const db = store(o);
  if (r.action === 'status' || !r.action) return { status: 200, body: { ok: true, ready: !!db, storage: db === memoryStore ? 'memory' : db ? 'redis' : 'none', now: Date.now() } };
  if (!db) return { status: 503, body: { error: 'Server Dengar bersama belum aktif: isi UPSTASH_REDIS_REST_URL & UPSTASH_REDIS_REST_TOKEN lalu deploy ulang' } };
  if (r.method !== 'POST') return { status: 405, body: { error: 'Gunakan POST' } };
  try {
    return { status: 200, body: await run(db, r.action, r.body || {}) };
  } catch (e: any) {
    if (e instanceof HttpError) return { status: e.status, body: { error: e.message, ...(e.extra || {}) } };
    return { status: 502, body: { error: e?.message || 'Server Dengar bersama bermasalah' } };
  }
}

/** Server lain (URL Server kustom) boleh dipakai dari domain mana pun — tidak ada cookie yang terlibat */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
