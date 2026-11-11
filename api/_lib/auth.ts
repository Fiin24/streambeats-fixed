/**
 * Akun Stream Beats (v3.7): daftar biasa TANPA kode verifikasi — cukup nama, username & password.
 * Masuk, profil, ganti password, dan sinkronisasi pustaka (lagu disukai, playlist, riwayat, artis diikuti, statistik).
 *
 * Penyimpanan : Upstash Redis REST (UPSTASH_REDIS_REST_URL/TOKEN atau KV_REST_API_URL/TOKEN dari Vercel).
 *               Akun (username, nama, hash password) disimpan di database. Password TIDAK pernah disimpan
 *               dalam bentuk asli — hanya hash scrypt + salt acak per akun.
 * Rahasia     : AUTH_SECRET (string acak panjang) untuk menandatangani sesi.
 * Proteksi    : salah password LOGIN_MAX_ATTEMPTS kali (default 3) → input password dibekukan
 *               LOGIN_LOCK_MINUTES menit (default 5) untuk akun tersebut. Status kunci disimpan di database
 *               sehingga berlaku di semua perangkat/browser.
 * Sosial      : foto profil (disimpan di database, dikompres di HP), cari pengguna lain berdasarkan username,
 *               lihat profil & playlist publik mereka (bisa disembunyikan lewat Edit profil → Profil publik).
 * Google      : "Lanjutkan dengan Google" (v4.3) — daftar/masuk pakai akun Gmail lewat OAuth 2.0 (authorization code).
 *               Aktif bila GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET diisi. Callback: /api/google-callback.
 *               Akun Google tidak punya password (bisa dibuat nanti di Pengaturan → Akun).
 * Mode dev    : saat dijalankan lewat `npm run dev`/`preview` tanpa konfigurasi → penyimpanan memori.
 */
import { createHmac, randomBytes, randomInt, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

type Env = Record<string, string | undefined>;
export interface AuthReq {
  method: string;
  action: string;
  body: any;
  /** parameter URL (?action=…&u=…) — dipakai request GET seperti gambar foto profil */
  query?: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}
/** raw: respons biner (foto profil / halaman HTML) — selain itu body dikirim sebagai JSON.
 *  headers: header tambahan (Location untuk redirect 302, Set-Cookie untuk login Google) */
export interface AuthRes { status: number; body: unknown; raw?: { type: string; data: Buffer; cache: string }; headers?: Record<string, string> }
export interface AuthOpts { dev?: boolean; env?: Env }

const FAIL_WINDOW = 30 * 60; // hitungan salah password direset setelah 30 menit tanpa percobaan
const MAX_IP_FAILS_HOUR = 30; // batas kasar per jaringan (mencegah tebak massal ke banyak akun)
const MAX_REG_PER_IP_HOUR = 10; // batas pendaftaran per jaringan
const SESSION_DAYS = 60;
const MAX_SYNC_BYTES = 900_000;
const MAX_AVATAR_BYTES = 150_000; // foto profil sudah dikompres di HP (±320×320 JPEG, biasanya 15–40 KB)
const USER_INDEX = 'sb:unames'; // sorted set berisi semua username → pencarian pengguna

// ───────────────────────────── penyimpanan ─────────────────────────────
interface Store {
  get(key: string): Promise<string | null>;
  set(key: string, val: string, ttlSec?: number): Promise<void>;
  /** set hanya bila kunci belum ada → true bila berhasil (dipakai untuk klaim username secara atomik) */
  setNx(key: string, val: string): Promise<boolean>;
  del(...keys: string[]): Promise<void>;
  incr(key: string, ttlSec: number): Promise<number>;
  mget(keys: string[]): Promise<(string | null)[]>;
  /** indeks username (sorted set, skor 0 → urut abjad) */
  zadd(key: string, member: string): Promise<void>;
  zrem(key: string, member: string): Promise<void>;
  /** anggota berawalan `prefix` (urut abjad) */
  zprefix(key: string, prefix: string, limit: number): Promise<string[]>;
  zcard(key: string): Promise<number>;
  zall(key: string): Promise<string[]>;
}

function upstash(url: string, token: string): Store {
  const call = async (cmd: (string | number)[]) => {
    const r = await fetch(url.replace(/\/$/, ''), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(`Database: ${j.error || r.status}`);
    return j.result;
  };
  return {
    get: (k) => call(['GET', k]),
    set: async (k, v, ttl) => void (await call(ttl ? ['SET', k, v, 'EX', ttl] : ['SET', k, v])),
    setNx: async (k, v) => (await call(['SET', k, v, 'NX'])) === 'OK',
    del: async (...k) => void (k.length && (await call(['DEL', ...k]))),
    incr: async (k, ttl) => {
      const n = Number(await call(['INCR', k]));
      if (n === 1) await call(['EXPIRE', k, ttl]);
      return n;
    },
    mget: async (k) => (k.length ? ((await call(['MGET', ...k])) as (string | null)[]) : []),
    zadd: async (k, m) => void (await call(['ZADD', k, 0, m])),
    zrem: async (k, m) => void (await call(['ZREM', k, m])),
    zprefix: async (k, p, n) => (await call(['ZRANGEBYLEX', k, `[${p}`, `[${p}\xff`, 'LIMIT', 0, n])) as string[],
    zcard: async (k) => Number(await call(['ZCARD', k])),
    zall: async (k) => (await call(['ZRANGE', k, 0, -1])) as string[],
  };
}

const mem = new Map<string, { v: string; exp: number }>();
const memoryStore: Store = {
  async get(k) {
    const e = mem.get(k);
    if (!e) return null;
    if (e.exp && e.exp < Date.now()) { mem.delete(k); return null; }
    return e.v;
  },
  async set(k, v, ttl) { mem.set(k, { v, exp: ttl ? Date.now() + ttl * 1000 : 0 }); },
  async setNx(k, v) {
    if ((await memoryStore.get(k)) !== null) return false;
    mem.set(k, { v, exp: 0 });
    return true;
  },
  async del(...ks) { ks.forEach((k) => mem.delete(k)); },
  async incr(k, ttl) {
    const cur = Number((await memoryStore.get(k)) || 0) + 1;
    const e = mem.get(k);
    mem.set(k, { v: String(cur), exp: e && e.exp > Date.now() ? e.exp : Date.now() + ttl * 1000 });
    return cur;
  },
  async mget(ks) { return Promise.all(ks.map((k) => memoryStore.get(k))); },
  async zadd(k, m) { const set = memZ(k); set.add(m); },
  async zrem(k, m) { memZ(k).delete(m); },
  async zprefix(k, p, n) { return [...memZ(k)].sort().filter((x) => x.startsWith(p)).slice(0, n); },
  async zcard(k) { return memZ(k).size; },
  async zall(k) { return [...memZ(k)].sort(); },
};
const memSets = new Map<string, Set<string>>();
function memZ(k: string) { let s = memSets.get(k); if (!s) memSets.set(k, (s = new Set())); return s; }

// ───────────────────────────── konfigurasi ─────────────────────────────
interface Cfg {
  store: Store | null;
  secret: string | null;
  dev: boolean;
  required: boolean;
  maxAttempts: number;
  lockSec: number;
  /** login Google (OAuth) — null bila GOOGLE_CLIENT_ID/SECRET belum diisi */
  google: { id: string; secret: string } | null;
  /** alamat situs untuk redirect URI Google (opsional, bawaan: dari header Host) */
  appUrl: string | null;
}
const clampInt = (v: string | undefined, def: number, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && v !== undefined && v !== '' ? Math.min(max, Math.max(min, n)) : def;
};
function config(o: AuthOpts): Cfg {
  const env = { ...process.env, ...(o.env || {}) };
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const tok = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  const dev = !!o.dev || env.AUTH_DEV === '1';
  const store = url && tok ? upstash(url, tok) : dev ? memoryStore : null;
  const secret = env.AUTH_SECRET && env.AUTH_SECRET.length >= 16 ? env.AUTH_SECRET : dev ? 'dev-only-secret-stream-beats' : null;
  return {
    store, secret, dev,
    required: env.AUTH_OPTIONAL !== '1',
    maxAttempts: clampInt(env.LOGIN_MAX_ATTEMPTS, 3, 1, 20),
    lockSec: clampInt(env.LOGIN_LOCK_MINUTES, 5, 1, 1440) * 60,
    google: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { id: env.GOOGLE_CLIENT_ID.trim(), secret: env.GOOGLE_CLIENT_SECRET.trim() } : null,
    appUrl: (env.APP_URL || '').trim().replace(/\/+$/, '') || null,
  };
}

// ───────────────────────────── utilitas ─────────────────────────────
class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) { super(message); }
}
const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const hmac = (secret: string, s: string) => createHmac('sha256', secret).update(s).digest('base64url');
const eq = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
/** username: huruf kecil, angka, titik, garis bawah; 3–20 karakter */
const normUsername = (u: unknown) => String(u || '').trim().replace(/^@/, '').toLowerCase();
const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._]{1,18})[a-z0-9]$/;
const RESERVED = new Set(['admin', 'administrator', 'root', 'support', 'streambeats', 'stream.beats', 'system', 'moderator', 'local']);
function checkUsername(u: string) {
  if (u.length < 3) throw new HttpError(400, 'Username minimal 3 karakter');
  if (u.length > 20) throw new HttpError(400, 'Username maksimal 20 karakter');
  if (!USERNAME_RE.test(u) || /[._]{2}/.test(u)) throw new HttpError(400, 'Username hanya boleh huruf, angka, titik (.) dan garis bawah (_), tidak diawali/diakhiri simbol');
  if (RESERVED.has(u)) throw new HttpError(409, 'Username sudah dipakai, coba yang lain', { field: 'username' });
}
function checkPassword(p: unknown): string {
  const s = String(p || '');
  if (s.length < 8) throw new HttpError(400, 'Password minimal 8 karakter');
  if (s.length > 128) throw new HttpError(400, 'Password terlalu panjang');
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) throw new HttpError(400, 'Password harus berisi huruf dan angka');
  return s;
}
function cleanName(n: unknown): string {
  const s = String(n || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (s.length < 2) throw new HttpError(400, 'Nama minimal 2 karakter');
  return s;
}
async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const h = await scrypt(pw, salt, 64);
  return `s1$${salt.toString('base64')}$${h.toString('base64')}`;
}
async function verifyPassword(pw: string, stored: string) {
  const [, s, h] = stored.split('$');
  if (!s || !h) return false;
  const got = await scrypt(pw, Buffer.from(s, 'base64'), 64);
  const want = Buffer.from(h, 'base64');
  return got.length === want.length && timingSafeEqual(got, want);
}
const DUMMY_HASH = 's1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

interface User {
  uid: string;
  username?: string; // akun v3.7+
  email?: string; // akun lama v3.6 (daftar lewat email) / akun Google
  /** id akun Google (claim "sub") — akun yang daftar/terhubung lewat "Lanjutkan dengan Google" */
  google?: string;
  name: string;
  /** hash password; '' = akun Google tanpa password */
  pass: string;
  ver: number; // naik saat password diganti / keluar dari semua perangkat → sesi lama tidak berlaku
  createdAt: number;
  color: string;
  /** versi foto profil (berubah tiap ganti foto → URL baru, cache browser aman) */
  avatar?: string;
  /** true = profil & playlist disembunyikan dari pengguna lain */
  private?: boolean;
}

const COLORS = ['#ff6c25', '#1DB954', '#3080FF', '#FA243C', '#EDB200', '#a855f7', '#14b8a6', '#ec4899'];
const avatarUrl = (u: User) => (u.avatar ? `/api/auth?action=avatar&u=${encodeURIComponent(u.uid)}&v=${u.avatar}` : null);
const publicUser = (u: User) => ({
  uid: u.uid, username: u.username || null, email: u.email || null, name: u.name, color: u.color, createdAt: u.createdAt,
  avatar: avatarUrl(u), isPublic: !u.private, hasPassword: !!u.pass, google: !!u.google,
});
/** data yang boleh dilihat pengguna lain (tanpa email/uid internal) */
const otherUser = (u: User) => ({ username: u.username!, name: u.name, color: u.color, avatar: avatarUrl(u), createdAt: u.createdAt, isPublic: !u.private });

interface SyncedPlaylist { id: string; name: string; description?: string; createdAt: number; updatedAt?: number; tracks: any[] }
const playlistSummary = (p: SyncedPlaylist) => ({
  id: p.id, name: p.name, description: p.description || '', count: p.tracks?.length || 0, updatedAt: p.updatedAt || p.createdAt,
  covers: [...new Set((p.tracks || []).map((t) => t?.thumbnail).filter(Boolean))].slice(0, 4) as string[],
});
/** potong field lagu agar respons kecil & tidak membawa data pribadi (mis. waktu diputar) */
const slimTrack = (t: any) => ({
  type: t.type, id: t.id, videoId: t.videoId, title: t.title, subtitle: t.subtitle, artists: t.artists, album: t.album,
  thumbnail: t.thumbnail, duration: t.duration, browseId: t.browseId,
});

const K = {
  uname: (u: string) => `sb:uname:${u}`,
  email: (e: string) => `sb:email:${e}`,
  user: (uid: string) => `sb:user:${uid}`,
  fails: (acct: string) => `sb:lfail:${acct}`,
  lock: (acct: string) => `sb:lock:${acct}`,
  ipFails: (ip: string) => `sb:ipfail:${ip}`,
  ipReg: (ip: string) => `sb:ipreg:${ip}`,
  data: (uid: string) => `sb:data:${uid}`,
  avatar: (uid: string) => `sb:avatar:${uid}`,
  google: (sub: string) => `sb:google:${sub}`,
  gcode: (code: string) => `sb:gcode:${code}`,
  ufollow: (uid: string) => `sb:ufollow:${uid}`, // daftar uid pengguna yang diikuti
  unotif: (uid: string) => `sb:unotif:${uid}`, // notifikasi "X mulai mengikutimu" (maks 50)
  room: (uid: string) => `sb:room:${uid}`, // room Dengar bersama yang sedang dibuka (TTL pendek)
  collab: (id: string) => `sb:collab:${id}`, // playlist kolaboratif
  ucollab: (uid: string) => `sb:ucollab:${uid}`, // id playlist kolaboratif milik / diikuti pengguna
};

/* ── teman & playlist kolaboratif ── */
interface CollabTrack { [k: string]: unknown; videoId: string; by: string; byUid: string; addedAt: number }
interface Collab { id: string; owner: string; ownerName: string; name: string; description: string; tracks: CollabTrack[]; members: string[]; createdAt: number; updatedAt: number }
const MAX_COLLAB_TRACKS = 300;
const MAX_COLLAB_MEMBERS = 50;
const cstr = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const collabTrack = (t: any) => (t && typeof t.videoId === 'string' && /^[\w-]{11}$/.test(t.videoId) ? { ...slimTrack(t), title: cstr(t.title, 200) } : null);
async function readJson<T>(c: Cfg, key: string, def: T): Promise<T> {
  const raw = await c.store!.get(key);
  try { return raw ? (JSON.parse(raw) as T) : def; } catch { return def; }
}
async function editList(c: Cfg, key: string, id: string, add: boolean) {
  const list = await readJson<string[]>(c, key, []);
  const next = add ? [id, ...list.filter((x) => x !== id)].slice(0, 200) : list.filter((x) => x !== id);
  await c.store!.set(key, JSON.stringify(next));
}
const collabView = (p: Collab, uid: string, full: boolean) => ({
  id: p.id, name: p.name, description: p.description, ownerName: p.ownerName, owner: p.owner === uid, member: p.members.includes(uid),
  members: p.members.length, count: p.tracks.length, updatedAt: p.updatedAt,
  covers: [...new Set(p.tracks.map((t) => t.thumbnail as string).filter(Boolean))].slice(0, 4),
  ...(full ? { tracks: p.tracks.map(({ byUid, ...t }) => ({ ...t, mine: byUid === uid })) } : {}),
});

async function getUser(c: Cfg, uid: string): Promise<User | null> {
  const s = await c.store!.get(K.user(uid));
  return s ? (JSON.parse(s) as User) : null;
}
/** cari akun dari username (akun baru) atau email (akun lama v3.6) */
async function findUser(c: Cfg, ident: string): Promise<User | null> {
  const uid = await c.store!.get(ident.includes('@') ? K.email(ident) : K.uname(ident));
  return uid ? getUser(c, uid) : null;
}
const saveUser = (c: Cfg, u: User) => c.store!.set(K.user(u.uid), JSON.stringify(u));

function issueToken(c: Cfg, u: User) {
  const payload = b64u(JSON.stringify({ u: u.uid, v: u.ver, e: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400 }));
  return `v1.${payload}.${hmac(c.secret!, payload)}`;
}
async function authed(c: Cfg, headers: AuthReq['headers']): Promise<User> {
  const raw = String(headers.authorization || headers.Authorization || '');
  const tok = raw.startsWith('Bearer ') ? raw.slice(7) : '';
  const [ver, payload, sig] = tok.split('.');
  if (ver !== 'v1' || !payload || !sig || !eq(sig, hmac(c.secret!, payload))) throw new HttpError(401, 'Sesi tidak valid, silakan masuk lagi');
  let p: { u: string; v: number; e: number };
  try { p = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { throw new HttpError(401, 'Sesi tidak valid'); }
  if (p.e < Date.now() / 1000) throw new HttpError(401, 'Sesi berakhir, silakan masuk lagi');
  const u = await getUser(c, p.u);
  if (!u || u.ver !== p.v) throw new HttpError(401, 'Sesi berakhir, silakan masuk lagi');
  return u;
}

// ───────────────────────────── foto profil ─────────────────────────────
function parseImage(dataUrl: unknown): { type: string; data: Buffer } {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new HttpError(400, 'Format foto tidak didukung (pakai JPG, PNG, atau WEBP)');
  const data = Buffer.from(m[2], 'base64');
  if (data.length > MAX_AVATAR_BYTES) throw new HttpError(413, 'Ukuran foto terlalu besar');
  // cek tanda tangan file agar bukan sembarang data yang diberi label gambar
  const sig = data.subarray(0, 12);
  const ok = (m[1] === 'image/jpeg' && sig[0] === 0xff && sig[1] === 0xd8)
    || (m[1] === 'image/png' && sig.subarray(0, 4).toString('hex') === '89504e47')
    || (m[1] === 'image/webp' && sig.subarray(0, 4).toString() === 'RIFF' && sig.subarray(8, 12).toString() === 'WEBP');
  if (!ok) throw new HttpError(400, 'File foto rusak atau tidak valid');
  return { type: m[1], data };
}

/** ambil akun dari daftar username sekaligus (3 panggilan database untuk berapa pun jumlahnya) */
async function usersByUsernames(c: Cfg, names: string[]): Promise<User[]> {
  if (!names.length) return [];
  const uids = await c.store!.mget(names.map(K.uname));
  const ids = uids.filter((x): x is string => !!x);
  const raws = await c.store!.mget(ids.map(K.user));
  return raws.filter((x): x is string => !!x).map((x) => JSON.parse(x) as User).filter((u) => !!u.username);
}
async function userByUsername(c: Cfg, username: string): Promise<User> {
  const u = (await usersByUsernames(c, [normUsername(username)]))[0];
  if (!u) throw new HttpError(404, 'Pengguna tidak ditemukan');
  return u;
}
async function syncedPlaylists(c: Cfg, uid: string): Promise<{ playlists: SyncedPlaylist[]; liked: number; follows: number }> {
  const raw = await c.store!.get(K.data(uid));
  const d = raw ? JSON.parse(raw)?.data : null;
  return {
    // lewati playlist yang sudah dihapus pemiliknya (penanda "tomb" dari sinkronisasi)
    playlists: (Array.isArray(d?.playlists) ? d.playlists as SyncedPlaylist[] : [])
      .filter((p) => p && p.id && !((d?.tomb?.[`pl:${p.id}`] || 0) >= (p.updatedAt || p.createdAt || 0))),
    liked: Array.isArray(d?.liked) ? d.liked.length : 0,
    follows: Array.isArray(d?.follows) ? d.follows.length : 0,
  };
}

// ───────────────────────── pembekuan setelah salah password ─────────────────────────
const fmtWait = (sec: number) => {
  if (sec < 60) return `${sec} detik`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return s ? `${m} menit ${s} detik` : `${m} menit`;
};
/** lempar 429 bila akun sedang dibekukan */
async function assertNotLocked(c: Cfg, acct: string) {
  const until = Number((await c.store!.get(K.lock(acct))) || 0);
  const wait = Math.ceil((until - Date.now()) / 1000);
  if (wait > 0) {
    throw new HttpError(429, `Terlalu banyak percobaan salah. Input password dibekukan, coba lagi dalam ${fmtWait(wait)}.`, { locked: true, lockedFor: wait });
  }
}
/** catat 1 kali salah; kunci akun bila mencapai batas */
async function registerFail(c: Cfg, acct: string, ip: string | undefined, msg: string, status = 401): Promise<never> {
  if (ip) await c.store!.incr(K.ipFails(ip), 3600);
  const n = await c.store!.incr(K.fails(acct), FAIL_WINDOW);
  if (n >= c.maxAttempts) {
    await c.store!.set(K.lock(acct), String(Date.now() + c.lockSec * 1000), c.lockSec);
    await c.store!.del(K.fails(acct));
    throw new HttpError(429, `Password salah ${c.maxAttempts}x. Input password dibekukan selama ${fmtWait(c.lockSec)}.`, { locked: true, lockedFor: c.lockSec });
  }
  const left = c.maxAttempts - n;
  throw new HttpError(status, `${msg} Sisa ${left} percobaan sebelum dibekukan.`, { attemptsLeft: left });
}
const clearFails = (c: Cfg, acct: string) => c.store!.del(K.fails(acct));
/** periksa password akun yang sudah login (ganti password / hapus akun) — ikut aturan pembekuan yang sama */
async function confirmPassword(c: Cfg, u: User, pw: unknown, ip: string | undefined, msg: string) {
  const acct = `u:${u.uid}`;
  await assertNotLocked(c, acct);
  if (!(await verifyPassword(String(pw || ''), u.pass))) await registerFail(c, acct, ip, msg, 400); // 400: sesi tetap valid
  await clearFails(c, acct);
}

// ───────────────────────────── login Google (OAuth 2.0) ─────────────────────────────
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const APP_SCHEME = 'com.musickuzyy.streambeats'; // deep link APK: com.musickuzyy.streambeats://auth?gauth=…
const GOOGLE_STATE_TTL = 15 * 60;
const GOOGLE_CODE_TTL = 180; // kode sekali pakai untuk menukar sesi (3 menit)
const GSTATE_COOKIE = 'sb_gstate';

const firstHeader = (v: string | string[] | undefined) => String(Array.isArray(v) ? v[0] : v || '').split(',')[0].trim();
/** origin situs (https://domain) — APP_URL bila diisi, selain itu dari header Host */
function siteOrigin(c: Cfg, h: AuthReq['headers']): string {
  if (c.appUrl) return c.appUrl;
  const host = firstHeader(h['x-forwarded-host']) || firstHeader(h.host) || 'localhost';
  const proto = firstHeader(h['x-forwarded-proto']) || (/^(localhost|127\.|\[::1\])/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}
/** redirect URI yang harus didaftarkan di Google Cloud Console */
export const googleCallbackUrl = (origin: string) => `${origin}/api/google-callback`;
function readCookie(h: AuthReq['headers'], name: string): string {
  const v = h.cookie ?? h.Cookie;
  const raw = Array.isArray(v) ? v.join(';') : String(v || '');
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}
const escHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

/** langkah 1: arahkan ke halaman pilih akun Google */
function googleStart(c: Cfg, r: AuthReq): AuthRes {
  if (!c.google) return { status: 503, body: { error: 'Login Google belum diaktifkan di server (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).' } };
  const origin = siteOrigin(c, r.headers);
  const app = r.query?.app === '1';
  const nonce = randomBytes(12).toString('base64url');
  const payload = b64u(JSON.stringify({ n: nonce, a: app ? 1 : 0, e: Math.floor(Date.now() / 1000) + GOOGLE_STATE_TTL }));
  const state = `${payload}.${hmac(c.secret!, `g:${payload}`)}`;
  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: c.google.id,
    redirect_uri: googleCallbackUrl(origin),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  }).toString();
  // web: ikat permintaan ke browser ini (cegah login CSRF). APK membuka Google di Chrome → cookie tidak terbawa.
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  if (!app) headers['Set-Cookie'] = `${GSTATE_COOKIE}=${nonce}; Path=/api; Max-Age=${GOOGLE_STATE_TTL}; HttpOnly; SameSite=Lax${origin.startsWith('https:') ? '; Secure' : ''}`;
  if (r.query?.format === 'json') return { status: 200, body: { ok: true, url: url.toString() }, headers };
  return { status: 302, body: null, headers: { ...headers, Location: url.toString() } };
}

interface GoogleProfile { sub: string; email: string; name: string; picture: string }
/** tukar authorization code → id_token (langsung dari Google lewat HTTPS, jadi isinya bisa dipercaya) */
async function googleProfile(c: Cfg, code: string, redirectUri: string): Promise<GoogleProfile> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: c.google!.id, client_secret: c.google!.secret, redirect_uri: redirectUri, grant_type: 'authorization_code' }).toString(),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || !j.id_token) {
    console.error('[auth] google token', res.status, j.error, j.error_description);
    if (j.error === 'redirect_uri_mismatch') throw new HttpError(502, `Redirect URI belum didaftarkan di Google Cloud: ${redirectUri}`);
    if (j.error === 'invalid_client') throw new HttpError(502, 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET di server salah.');
    throw new HttpError(502, 'Google menolak login. Coba lagi.');
  }
  let p: any;
  try { p = JSON.parse(Buffer.from(String(j.id_token).split('.')[1] || '', 'base64url').toString()); } catch { throw new HttpError(502, 'Balasan Google tidak valid.'); }
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(p.iss) || p.aud !== c.google!.id || !(Number(p.exp) > Date.now() / 1000) || !p.sub) {
    throw new HttpError(502, 'Token Google tidak valid.');
  }
  if (!p.email || !(p.email_verified === true || p.email_verified === 'true')) throw new HttpError(400, 'Email akun Google ini belum terverifikasi.');
  return { sub: String(p.sub), email: String(p.email).trim().toLowerCase(), name: String(p.name || p.given_name || ''), picture: p.picture ? String(p.picture) : '' };
}

/** username otomatis dari alamat Gmail (andi.pratama@gmail.com → andi.pratama, bila dipakai → andi.pratama123) */
async function claimUsernameFromEmail(c: Cfg, email: string, uid: string): Promise<string> {
  let base = email.split('@')[0].toLowerCase().replace(/\+.*$/, '').replace(/[^a-z0-9._]/g, '').replace(/[._]{2,}/g, '.').replace(/^[._]+|[._]+$/g, '').slice(0, 15);
  if (base.length < 3) base = `user${base}`.slice(0, 15);
  base = base.replace(/[._]+$/, '');
  const valid = (u: string) => u.length >= 3 && u.length <= 20 && USERNAME_RE.test(u) && !/[._]{2}/.test(u) && !RESERVED.has(u);
  const tries = [base, ...Array.from({ length: 12 }, (_, i) => `${base}${randomInt(10 ** Math.min(2 + Math.floor(i / 4), 4), 10 ** Math.min(3 + Math.floor(i / 4), 5))}`)];
  for (const u of tries) if (valid(u) && (await c.store!.setNx(K.uname(u), uid))) return u;
  const fallback = `user${randomBytes(5).toString('hex')}`;
  if (await c.store!.setNx(K.uname(fallback), uid)) return fallback;
  throw new HttpError(500, 'Gagal membuat username. Coba lagi.');
}

/** foto profil Google → foto profil Stream Beats (sekali saat daftar; gagal = diabaikan) */
async function importGoogleAvatar(c: Cfg, u: User, picture: string) {
  if (!picture) return;
  try {
    const res = await fetch(picture.replace(/=s\d+(-c)?$/, '=s256-c'), { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return;
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (!/^image\/(jpeg|png|webp)$/.test(type)) return;
    const data = Buffer.from(await res.arrayBuffer());
    if (!data.length || data.length > MAX_AVATAR_BYTES) return;
    await c.store!.set(K.avatar(u.uid), JSON.stringify({ type, b64: data.toString('base64') }));
    u.avatar = randomBytes(6).toString('base64url');
  } catch { /* tanpa foto */ }
}

/** cari akun Google; bila belum ada: hubungkan ke akun lama dengan email sama, atau buat akun baru */
async function googleUser(c: Cfg, p: GoogleProfile, ip: string | undefined): Promise<{ u: User; created: boolean }> {
  const byGoogle = await c.store!.get(K.google(p.sub));
  if (byGoogle) {
    const u = await getUser(c, byGoogle);
    if (u) return { u, created: false };
    await c.store!.del(K.google(p.sub)); // penunjuk yatim (akun sudah dihapus)
  }
  const byEmail = await c.store!.get(K.email(p.email));
  if (byEmail) {
    const u = await getUser(c, byEmail);
    if (u) {
      // akun lama (v3.6, daftar lewat email ini) → sambungkan ke Google, password lama tetap berlaku
      if (u.google !== p.sub) { u.google = p.sub; await saveUser(c, u); }
      await c.store!.set(K.google(p.sub), u.uid);
      return { u, created: false };
    }
  }
  if (ip && (await c.store!.incr(K.ipReg(ip), 3600)) > MAX_REG_PER_IP_HOUR) {
    throw new HttpError(429, 'Terlalu banyak pendaftaran dari jaringan ini. Coba lagi nanti.');
  }
  const uid = `u_${randomBytes(9).toString('base64url')}`;
  if (!(await c.store!.setNx(K.email(p.email), uid))) {
    // pendaftaran bersamaan dengan email yang sama → pakai akun yang sudah jadi
    const other = await c.store!.get(K.email(p.email));
    const u = other ? await getUser(c, other) : null;
    if (u) return { u, created: false };
    throw new HttpError(409, 'Coba lagi sebentar.');
  }
  const username = await claimUsernameFromEmail(c, p.email, uid);
  let name = p.name.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (name.length < 2) name = username.slice(0, 40);
  const u: User = {
    uid, username, email: p.email, google: p.sub, name, pass: '', ver: 1, createdAt: Date.now(), color: COLORS[randomInt(0, COLORS.length)],
  };
  await importGoogleAvatar(c, u, p.picture);
  await saveUser(c, u);
  await c.store!.set(K.google(p.sub), uid);
  await c.store!.zadd(USER_INDEX, username);
  return { u, created: true };
}

/** halaman penutup untuk APK: Google dibuka di Chrome → kembalikan ke aplikasi lewat deep link */
function appReturnPage(params: Record<string, string>): AuthRes {
  const qs = new URLSearchParams(params).toString();
  const intent = `intent://auth?${qs}#Intent;scheme=${APP_SCHEME};package=${APP_SCHEME};end`;
  const scheme = `${APP_SCHEME}://auth?${qs}`;
  const ok = !!params.gauth;
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stream Beats</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#000;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
a{display:inline-block;margin-top:20px;padding:14px 28px;border-radius:999px;background:#1DB954;color:#000;font-weight:700;text-decoration:none}p{color:#a1a1aa}</style></head>
<body><div><h2>${ok ? 'Login Google berhasil' : 'Login Google gagal'}</h2><p>${escHtml(ok ? 'Kembali ke aplikasi Stream Beats…' : params.gauth_error || '')}</p>
<a id="go" href="${escHtml(intent)}">Buka Stream Beats</a></div>
<script>var i=${JSON.stringify(intent)},s=${JSON.stringify(scheme)};setTimeout(function(){location.href=/Android/i.test(navigator.userAgent)?i:s},300);document.getElementById('go').onclick=function(e){e.preventDefault();location.href=/Android/i.test(navigator.userAgent)?i:s};</script>
</body></html>`;
  return { status: 200, body: null, raw: { type: 'text/html; charset=utf-8', data: Buffer.from(html), cache: 'no-store' } };
}

/** langkah 2: Google kembali ke /api/google-callback?code=…&state=… */
async function googleCallback(c: Cfg, r: AuthReq): Promise<AuthRes> {
  const origin = siteOrigin(c, r.headers);
  const q = r.query || {};
  let app = false;
  const done = (params: Record<string, string>): AuthRes => app
    ? appReturnPage(params)
    : {
      status: 302, body: null,
      headers: { Location: `${origin}/?${new URLSearchParams(params)}`, 'Cache-Control': 'no-store', 'Set-Cookie': `${GSTATE_COOKIE}=; Path=/api; Max-Age=0; HttpOnly; SameSite=Lax` },
    };
  try {
    const [payload, sig] = String(q.state || '').split('.');
    if (!payload || !sig || !c.secret || !eq(sig, hmac(c.secret, `g:${payload}`))) throw new HttpError(400, 'Permintaan login Google tidak valid. Coba lagi.');
    const st = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { n: string; a: number; e: number };
    app = st.a === 1;
    if (!c.store || !c.google) throw new HttpError(503, 'Login Google belum diaktifkan di server.');
    if (st.e < Date.now() / 1000) throw new HttpError(400, 'Waktu login Google habis. Coba lagi.');
    if (q.error) throw new HttpError(400, q.error === 'access_denied' ? 'Login Google dibatalkan.' : `Login Google gagal (${String(q.error).slice(0, 60)}).`);
    if (!app && readCookie(r.headers, GSTATE_COOKIE) !== st.n) throw new HttpError(400, 'Sesi login Google tidak cocok. Muat ulang halaman lalu coba lagi.');
    if (!q.code) throw new HttpError(400, 'Kode dari Google tidak ada. Coba lagi.');
    const prof = await googleProfile(c, String(q.code), googleCallbackUrl(origin));
    const { u, created } = await googleUser(c, prof, r.ip);
    // jangan taruh token sesi di URL → kode sekali pakai, ditukar lewat POST google-exchange
    const code = randomBytes(24).toString('base64url');
    await c.store.set(K.gcode(code), JSON.stringify({ uid: u.uid, created }), GOOGLE_CODE_TTL);
    return done({ gauth: code });
  } catch (e: any) {
    if (!(e instanceof HttpError)) console.error('[auth] google callback', e);
    return done({ gauth_error: e instanceof HttpError ? e.message : 'Login Google gagal. Coba lagi.' });
  }
}

// ───────────────────────────── aksi ─────────────────────────────
async function route(c: Cfg, r: AuthReq): Promise<unknown> {
  const b = r.body && typeof r.body === 'object' ? r.body : {};
  const post = r.method === 'POST';
  const needPost = () => { if (!post) throw new HttpError(405, 'Gunakan POST'); };

  // Tampilan versi lama (v3.6, daftar via email + kode) yang masih tersimpan di cache HP/browser
  const OUTDATED = 'Aplikasi kamu masih versi lama (tersimpan di cache). Tutup aplikasi sepenuhnya lalu buka lagi, atau muat ulang halaman, untuk memakai pendaftaran baru dengan username.';
  if (['verify', 'resend', 'forgot', 'reset'].includes(r.action)) throw new HttpError(426, OUTDATED, { outdated: true });
  if (r.action === 'register' && b.username === undefined && b.email !== undefined) throw new HttpError(426, OUTDATED, { outdated: true });

  switch (r.action) {
    case 'check-username': {
      // cek ketersediaan username saat mengetik di form daftar
      const username = normUsername(b.username ?? '');
      try { checkUsername(username); } catch (e: any) { return { ok: true, available: false, reason: e.message }; }
      const taken = !!(await c.store!.get(K.uname(username)));
      return { ok: true, available: !taken, ...(taken ? { reason: 'Username sudah dipakai, coba yang lain' } : {}) };
    }
    case 'register': {
      needPost();
      const name = cleanName(b.name);
      const username = normUsername(b.username); checkUsername(username);
      const pw = checkPassword(b.password);
      if (b.confirm !== undefined && String(b.confirm) !== pw) throw new HttpError(400, 'Konfirmasi password tidak sama');
      if (r.ip && (await c.store!.incr(K.ipReg(r.ip), 3600)) > MAX_REG_PER_IP_HOUR) {
        throw new HttpError(429, 'Terlalu banyak pendaftaran dari jaringan ini. Coba lagi nanti.');
      }
      const uid = `u_${randomBytes(9).toString('base64url')}`;
      const pass = await hashPassword(pw);
      // klaim username secara atomik → dua orang tidak bisa mendaftar username yang sama bersamaan
      if (!(await c.store!.setNx(K.uname(username), uid))) throw new HttpError(409, 'Username sudah dipakai, coba yang lain', { field: 'username' });
      const u: User = {
        uid, username, name, pass, ver: 1, createdAt: Date.now(), color: COLORS[randomInt(0, COLORS.length)],
      };
      await saveUser(c, u);
      await c.store!.zadd(USER_INDEX, username);
      return { ok: true, token: issueToken(c, u), user: publicUser(u) };
    }
    case 'google-exchange': {
      // kode sekali pakai dari /api/google-callback → sesi
      needPost();
      const code = String(b.code || '');
      if (!/^[A-Za-z0-9_-]{20,64}$/.test(code)) throw new HttpError(400, 'Kode login Google tidak valid.');
      const raw = await c.store!.get(K.gcode(code));
      if (!raw) throw new HttpError(400, 'Kode login Google sudah kedaluwarsa. Coba lagi.');
      await c.store!.del(K.gcode(code));
      const g = JSON.parse(raw) as { uid: string; created: boolean };
      const u = await getUser(c, g.uid);
      if (!u) throw new HttpError(404, 'Akun tidak ditemukan');
      return { ok: true, token: issueToken(c, u), user: publicUser(u), created: !!g.created };
    }
    case 'login': {
      needPost();
      const ident = normUsername(b.username ?? b.email);
      if (!ident) throw new HttpError(400, 'Masukkan username');
      if (r.ip && Number((await c.store!.get(K.ipFails(r.ip))) || 0) >= MAX_IP_FAILS_HOUR) {
        throw new HttpError(429, 'Terlalu banyak percobaan masuk dari jaringan ini. Coba lagi nanti.', { locked: true, lockedFor: 15 * 60 });
      }
      const u = await findUser(c, ident);
      // kunci per akun (uid) — username yang tidak terdaftar juga dihitung agar tidak membocorkan siapa yang punya akun
      const acct = u ? `u:${u.uid}` : `x:${ident}`;
      await assertNotLocked(c, acct);
      const ok = await verifyPassword(String(b.password || ''), u ? u.pass : DUMMY_HASH);
      if (!u || !ok) await registerFail(c, acct, r.ip, 'Username atau password salah.');
      await clearFails(c, acct);
      if (u!.username) await c.store!.zadd(USER_INDEX, u!.username); // akun lama yang belum masuk indeks pencarian
      return { ok: true, token: issueToken(c, u!), user: publicUser(u!) };
    }
    case 'me': {
      const u = await authed(c, r.headers);
      if (u.username) await c.store!.zadd(USER_INDEX, u.username); // pastikan bisa ditemukan di pencarian
      return { ok: true, user: publicUser(u) };
    }
    case 'update': {
      needPost();
      const u = await authed(c, r.headers);
      if (b.name !== undefined) u.name = cleanName(b.name);
      if (typeof b.color === 'string' && COLORS.includes(b.color)) u.color = b.color;
      if (typeof b.isPublic === 'boolean') u.private = !b.isPublic;
      await saveUser(c, u);
      return { ok: true, user: publicUser(u) };
    }
    case 'password': {
      needPost();
      const u = await authed(c, r.headers);
      const next = checkPassword(b.newPassword);
      // akun Google tanpa password → buat password pertama (tidak perlu password lama)
      if (u.pass) await confirmPassword(c, u, b.oldPassword, r.ip, 'Password lama salah.');
      u.pass = await hashPassword(next);
      u.ver++;
      await saveUser(c, u);
      return { ok: true, token: issueToken(c, u), user: publicUser(u) };
    }
    case 'logout-all': {
      needPost();
      const u = await authed(c, r.headers);
      u.ver++;
      await saveUser(c, u);
      return { ok: true };
    }
    case 'delete': {
      needPost();
      const u = await authed(c, r.headers);
      if (u.pass) await confirmPassword(c, u, b.password, r.ip, 'Password salah.');
      else if (normUsername(b.confirm) !== (u.username || '')) throw new HttpError(400, 'Ketik username kamu dengan benar untuk konfirmasi.');
      const keys = [K.user(u.uid), K.data(u.uid), K.avatar(u.uid), K.fails(`u:${u.uid}`), K.lock(`u:${u.uid}`)];
      if (u.google) keys.push(K.google(u.google));
      if (u.username) { keys.push(K.uname(u.username)); await c.store!.zrem(USER_INDEX, u.username); }
      if (u.email) keys.push(K.email(u.email));
      await c.store!.del(...keys);
      return { ok: true };
    }
    case 'avatar-upload': {
      needPost();
      const u = await authed(c, r.headers);
      const img = parseImage(b.image);
      await c.store!.set(K.avatar(u.uid), JSON.stringify({ type: img.type, b64: img.data.toString('base64') }));
      u.avatar = randomBytes(6).toString('base64url');
      await saveUser(c, u);
      return { ok: true, user: publicUser(u) };
    }
    case 'avatar-remove': {
      needPost();
      const u = await authed(c, r.headers);
      await c.store!.del(K.avatar(u.uid));
      delete u.avatar;
      await saveUser(c, u);
      return { ok: true, user: publicUser(u) };
    }
    case 'users': {
      // cari pengguna lain berdasarkan username (awalan dulu, lalu yang mengandung kata kunci)
      const me = await authed(c, r.headers);
      const q = normUsername(b.q ?? r.query?.q).replace(/[^a-z0-9._]/g, '').slice(0, 20);
      if (!q) return { ok: true, users: [] };
      const limit = Math.min(30, Math.max(1, Number(b.limit) || 20));
      let names = await c.store!.zprefix(USER_INDEX, q, limit);
      if (names.length < limit && q.length >= 2 && (await c.store!.zcard(USER_INDEX)) <= 5000) {
        const more = (await c.store!.zall(USER_INDEX)).filter((n) => n.includes(q) && !names.includes(n));
        names = [...names, ...more].slice(0, limit);
      }
      const users = await usersByUsernames(c, names);
      return { ok: true, users: users.map((u) => ({ ...otherUser(u), me: u.uid === me.uid })) };
    }
    case 'profile': {
      // profil publik pengguna lain + ringkasan playlist mereka
      const me = await authed(c, r.headers);
      const u = await userByUsername(c, String(b.username ?? r.query?.username ?? ''));
      const mine = u.uid === me.uid;
      const followingUser = (await readJson<string[]>(c, K.ufollow(me.uid), [])).includes(u.uid);
      if (u.private && !mine) return { ok: true, user: otherUser(u), me: mine, private: true, playlists: [], stats: null, followingUser };
      const d = await syncedPlaylists(c, u.uid);
      return {
        ok: true, user: otherUser(u), me: mine, private: false,
        playlists: d.playlists.sort((x, y) => (y.updatedAt || y.createdAt) - (x.updatedAt || x.createdAt)).map(playlistSummary),
        stats: { playlists: d.playlists.length, liked: d.liked, following: d.follows },
        followingUser,
      };
    }
    case 'user-playlist': {
      const me = await authed(c, r.headers);
      const u = await userByUsername(c, String(b.username ?? r.query?.username ?? ''));
      if (u.private && u.uid !== me.uid) throw new HttpError(403, 'Profil ini privat');
      const p = (await syncedPlaylists(c, u.uid)).playlists.find((x) => x.id === String(b.id ?? r.query?.id ?? ''));
      if (!p) throw new HttpError(404, 'Playlist tidak ditemukan');
      return { ok: true, user: otherUser(u), playlist: { ...playlistSummary(p), tracks: (p.tracks || []).filter((t) => t?.videoId).map(slimTrack) } };
    }
    case 'follow-user': {
      const me = await authed(c, r.headers);
      const u = await userByUsername(c, String(b.username ?? ''));
      if (u.uid === me.uid) throw new HttpError(400, 'Tidak bisa mengikuti diri sendiri');
      const on = !(await readJson<string[]>(c, K.ufollow(me.uid), [])).includes(u.uid);
      await editList(c, K.ufollow(me.uid), u.uid, on);
      // beri tahu pengguna yang diikuti (satu entri per pengikut, yang terbaru di atas)
      try {
        const list = (await readJson<any[]>(c, K.unotif(u.uid), [])).filter((n) => n?.uid !== me.uid);
        if (on) list.unshift({ id: randomBytes(6).toString('base64url'), type: 'follow', uid: me.uid, at: Date.now(), read: false });
        await c.store!.set(K.unotif(u.uid), JSON.stringify(list.slice(0, 50)));
      } catch { /* notifikasi bukan bagian penting */ }
      return { ok: true, following: on };
    }
    case 'notifications': {
      // daftar pengikut baru + apakah kita sudah mengikuti balik
      const me = await authed(c, r.headers);
      const list = await readJson<any[]>(c, K.unotif(me.uid), []);
      if (!list.length) return { ok: true, items: [] };
      const mine = await readJson<string[]>(c, K.ufollow(me.uid), []);
      const users = await c.store!.mget(list.map((n) => K.user(n.uid)));
      const items = list.flatMap((n, i) => {
        const u = users[i] ? (JSON.parse(users[i]!) as User) : null;
        if (!u?.username) return [];
        return [{ id: n.id, type: 'follow', at: n.at, read: !!n.read, user: otherUser(u), followingBack: mine.includes(u.uid) }];
      });
      return { ok: true, items };
    }
    case 'notifications-read': {
      const me = await authed(c, r.headers);
      const ids: string[] | null = Array.isArray(b.ids) ? b.ids.map(String) : null;
      const list = (await readJson<any[]>(c, K.unotif(me.uid), [])).map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n));
      await c.store!.set(K.unotif(me.uid), JSON.stringify(list));
      return { ok: true };
    }
    case 'friends': {
      // pengguna yang diikuti + room Dengar bersama yang sedang mereka buka
      const me = await authed(c, r.headers);
      const list = await readJson<string[]>(c, K.ufollow(me.uid), []);
      if (!list.length) return { ok: true, friends: [] };
      const [users, rooms] = await Promise.all([c.store!.mget(list.map(K.user)), c.store!.mget(list.map(K.room))]);
      const friends = list.flatMap((_, i) => {
        const u = users[i] ? (JSON.parse(users[i]!) as User) : null;
        if (!u?.username) return [];
        const room = rooms[i] && !u.private ? JSON.parse(rooms[i]!) : null;
        return [{ ...otherUser(u), room }];
      });
      return { ok: true, friends };
    }
    case 'room-presence': {
      // dipanggil berkala oleh host room; kosongkan `code` untuk menyembunyikan room
      const me = await authed(c, r.headers);
      const code = cstr(b.code, 8).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!code) { await c.store!.del(K.room(me.uid)); return { ok: true }; }
      const room = { code, hostName: cstr(b.hostName, 24), track: cstr(b.track, 120), listeners: Math.max(0, Math.min(99, Number(b.listeners) || 0)), at: Date.now() };
      await c.store!.set(K.room(me.uid), JSON.stringify(room), 150);
      return { ok: true };
    }
    case 'collab': {
      const me = await authed(c, r.headers);
      const op = String(b.op || '');
      const myName = me.username || me.name;
      if (op === 'list') {
        const ids = await readJson<string[]>(c, K.ucollab(me.uid), []);
        const raws = ids.length ? await c.store!.mget(ids.map(K.collab)) : [];
        return { ok: true, playlists: raws.flatMap((x) => (x ? [collabView(JSON.parse(x) as Collab, me.uid, false)] : [])) };
      }
      const now = Date.now();
      if (op === 'create') {
        const id = globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12);
        const tracks = (Array.isArray(b.tracks) ? b.tracks : []).slice(0, MAX_COLLAB_TRACKS).map(collabTrack).filter(Boolean)
          .map((t: any) => ({ ...t, by: myName, byUid: me.uid, addedAt: now })) as CollabTrack[];
        const p: Collab = { id, owner: me.uid, ownerName: myName, name: cstr(b.name, 80) || 'Playlist kolaboratif', description: cstr(b.description, 200), tracks, members: [me.uid], createdAt: now, updatedAt: now };
        await c.store!.set(K.collab(id), JSON.stringify(p));
        await editList(c, K.ucollab(me.uid), id, true);
        return { ok: true, playlist: collabView(p, me.uid, true) };
      }
      const id = cstr(b.id, 24).replace(/[^a-zA-Z0-9]/g, '');
      const p = await readJson<Collab | null>(c, K.collab(id), null);
      if (!p) throw new HttpError(404, 'Playlist kolaboratif tidak ditemukan');
      const save = async () => { p.updatedAt = now; await c.store!.set(K.collab(id), JSON.stringify(p)); };
      if (op === 'get') return { ok: true, playlist: collabView(p, me.uid, true) };
      if (op === 'join') {
        if (!p.members.includes(me.uid)) {
          if (p.members.length >= MAX_COLLAB_MEMBERS) throw new HttpError(409, 'Anggota playlist sudah penuh');
          p.members.push(me.uid);
          await save();
        }
        await editList(c, K.ucollab(me.uid), id, true);
        return { ok: true, playlist: collabView(p, me.uid, true) };
      }
      if (!p.members.includes(me.uid)) throw new HttpError(403, 'Gabung dulu untuk mengubah playlist ini');
      if (op === 'leave') {
        await editList(c, K.ucollab(me.uid), id, false);
        if (p.owner === me.uid) { await c.store!.del(K.collab(id)); return { ok: true, deleted: true }; }
        p.members = p.members.filter((x) => x !== me.uid);
        await save();
        return { ok: true, left: true };
      }
      if (op === 'add') {
        const t = collabTrack(b.track);
        if (!t) throw new HttpError(400, 'Lagu tidak valid');
        if (p.tracks.some((x) => x.videoId === t.videoId)) return { ok: true, dup: true, playlist: collabView(p, me.uid, true) };
        if (p.tracks.length >= MAX_COLLAB_TRACKS) throw new HttpError(409, `Maksimal ${MAX_COLLAB_TRACKS} lagu`);
        p.tracks.push({ ...t, by: myName, byUid: me.uid, addedAt: now } as CollabTrack);
      } else if (op === 'remove') {
        const i = p.tracks.findIndex((x) => x.videoId === String(b.videoId || ''));
        if (i < 0) throw new HttpError(404, 'Lagu tidak ada di playlist');
        if (p.owner !== me.uid && p.tracks[i].byUid !== me.uid) throw new HttpError(403, 'Hanya pemilik atau penambah lagu yang bisa menghapusnya');
        p.tracks.splice(i, 1);
      } else if (op === 'rename') {
        if (p.owner !== me.uid) throw new HttpError(403, 'Hanya pemilik yang bisa mengubah nama');
        p.name = cstr(b.name, 80) || p.name;
      } else throw new HttpError(400, 'Operasi tidak dikenal');
      await save();
      return { ok: true, playlist: collabView(p, me.uid, true) };
    }
    case 'sync': {
      const u = await authed(c, r.headers);
      const raw = await c.store!.get(K.data(u.uid));
      const cur = raw ? JSON.parse(raw) : null;
      if (!post) return { ok: true, updatedAt: cur?.updatedAt || 0, data: cur?.data || null };
      const base = Number(b.base || 0);
      if (cur && cur.updatedAt > base) {
        // perangkat lain menyimpan lebih dulu → kirim versi server agar digabung di perangkat ini
        throw new HttpError(409, 'Data berubah di perangkat lain', { updatedAt: cur.updatedAt, data: cur.data });
      }
      const json = JSON.stringify(b.data ?? null);
      if (json.length > MAX_SYNC_BYTES) throw new HttpError(413, 'Data pustaka terlalu besar untuk disinkronkan');
      const updatedAt = Math.max(Date.now(), (cur?.updatedAt || 0) + 1);
      await c.store!.set(K.data(u.uid), JSON.stringify({ updatedAt, data: b.data ?? null }));
      return { ok: true, updatedAt };
    }
    default:
      throw new HttpError(404, 'Aksi tidak dikenal');
  }
}

export async function handleAuth(r: AuthReq, o: AuthOpts = {}): Promise<AuthRes> {
  const c = config(o);
  const enabled = !!(c.store && c.secret);
  if (r.action === 'status') {
    return {
      status: 200,
      body: {
        ok: true, enabled, required: enabled && c.required, dev: c.store === memoryStore, google: enabled && !!c.google,
        maxAttempts: c.maxAttempts, lockMinutes: c.lockSec / 60,
        missing: [!c.store && 'database (UPSTASH_REDIS_REST_URL/TOKEN)', !c.secret && 'AUTH_SECRET'].filter(Boolean),
      },
    };
  }
  if (r.action === 'google-callback') return googleCallback(c, r);
  if (!enabled) return { status: 503, body: { error: 'Fitur akun belum dikonfigurasi di server.' } };
  if (r.action === 'google-start') return googleStart(c, r);
  if (r.action === 'avatar') {
    // gambar foto profil: URL memuat versi (&v=…) jadi aman di-cache lama oleh browser
    try {
      const uid = String(r.query?.u || '');
      const raw = uid ? await c.store!.get(K.avatar(uid)) : null;
      if (!raw) return { status: 404, body: { error: 'Foto tidak ditemukan' } };
      const a = JSON.parse(raw) as { type: string; b64: string };
      return { status: 200, body: null, raw: { type: a.type, data: Buffer.from(a.b64, 'base64'), cache: 'public, max-age=31536000, immutable' } };
    } catch (e) {
      console.error('[auth] avatar', e);
      return { status: 500, body: { error: 'Gagal memuat foto' } };
    }
  }
  try {
    return { status: 200, body: await route(c, r) };
  } catch (e: any) {
    if (e instanceof HttpError) return { status: e.status, body: { error: e.message, ...(e.extra || {}) } };
    console.error('[auth]', e);
    return { status: 500, body: { error: 'Terjadi kesalahan server. Coba lagi.' } };
  }
}

/** Ambil IP klien dari header proxy (Vercel/Netlify) */
export function clientIp(h: Record<string, string | string[] | undefined>): string | undefined {
  const v = h['x-nf-client-connection-ip'] || h['x-real-ip'] || h['x-forwarded-for'];
  return String(Array.isArray(v) ? v[0] : v || '').split(',')[0].trim() || undefined;
}
