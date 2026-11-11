/**
 * Sinkronisasi pustaka ke akun: lagu disukai, playlist, riwayat, artis diikuti, selera musik & statistik.
 * Strategi: gabung (merge) data lokal + server dengan penanda hapus (tombstone), lalu simpan dengan
 * pengecekan versi (base) — bila perangkat lain menyimpan lebih dulu, server mengembalikan 409 + datanya
 * dan perangkat ini menggabung ulang. Tidak ada data yang tertimpa diam-diam.
 */
import { create } from 'zustand';
import { usePlayer } from '../store/player';
import { useFollows, type FollowedArtist } from '../store/follows';
import { useStats, type SongStat, type ArtistStat } from '../store/stats';
import { useTaste, type Taste } from '../store/taste';
import { useAuth, LOCAL_USER } from '../store/auth';
import { useSyncMeta } from '../store/syncMeta';
import { authApi, AuthError } from './authApi';
import type { Track, UserPlaylist } from './types';

export interface SyncData {
  v: 1;
  liked: Track[];
  playlists: UserPlaylist[];
  history: Track[];
  follows: FollowedArtist[];
  taste?: Taste;
  stats: { days: Record<string, number>; songs: Record<string, SongStat>; artists: Record<string, ArtistStat>; totalS: number; totalN: number; since: number; log?: StatLog };
  tomb: Record<string, number>;
}

export const useSyncStatus = create<{ state: 'idle' | 'syncing' | 'error'; error: string | null }>(() => ({ state: 'idle', error: null }));

const TOMB_DAYS = 90;
type StatLog = Record<string, Record<string, [number, number]>>;
const LOG_DAYS = 366;

/** log Rekap per hari: hanya ±1 tahun terakhir & lagu ≥20 dtk, agar data sinkron tetap kecil */
function trimLog(log: StatLog = {}): StatLog {
  const keep = Object.keys(log).sort().slice(-LOG_DAYS);
  return Object.fromEntries(keep.map((k) => [k, Object.fromEntries(Object.entries(log[k]).filter(([, v]) => v[0] > 0 || v[1] >= 20))]));
}
function mergeLog(a: StatLog = {}, b: StatLog = {}): StatLog {
  const out: StatLog = { ...a };
  for (const [day, songs] of Object.entries(b)) {
    const cur = { ...(out[day] || {}) };
    for (const [id, v] of Object.entries(songs)) {
      const p = cur[id];
      cur[id] = p ? [Math.max(p[0], v[0]), Math.max(p[1], v[1])] : v;
    }
    out[day] = cur;
  }
  return trimLog(out);
}

function collect(uid: string): SyncData {
  const p = usePlayer.getState();
  const st = useStats.getState();
  return {
    v: 1,
    liked: p.liked,
    playlists: p.playlists,
    history: p.history.slice(0, 100),
    follows: useFollows.getState().artists,
    taste: useTaste.getState().byUser[uid],
    stats: { days: st.days, songs: st.songs, artists: st.artists, totalS: st.totalS, totalN: st.totalN, since: st.since, log: trimLog(st.log) },
    tomb: useSyncMeta.getState().tomb,
  };
}

const maxRec = (a: Record<string, number> = {}, b: Record<string, number> = {}) => {
  const o = { ...a };
  for (const [k, v] of Object.entries(b)) o[k] = Math.max(o[k] || 0, v || 0);
  return o;
};

/** Gabungkan dua salinan data (urutan argumen tidak mengubah isi hasil) */
export function mergeData(a: SyncData | null, b: SyncData | null): SyncData {
  if (!a) return b!;
  if (!b) return a;
  const cutoff = Date.now() - TOMB_DAYS * 864e5;
  const tomb = Object.fromEntries(Object.entries(maxRec(a.tomb, b.tomb)).filter(([, t]) => t > cutoff));
  const dead = (key: string, at = 0) => (tomb[key] || 0) > at;

  const likedMap = new Map<string, Track>();
  for (const t of [...(a.liked || []), ...(b.liked || [])]) {
    const prev = likedMap.get(t.videoId);
    if (!prev || (t.addedAt || 0) > (prev.addedAt || 0)) likedMap.set(t.videoId, t);
  }
  const order = new Map([...(a.liked || []), ...(b.liked || [])].map((t, i) => [t.videoId, i] as const));
  const liked = [...likedMap.values()]
    .filter((t) => !dead(`like:${t.videoId}`, t.addedAt || 0))
    .sort((x, y) => (y.addedAt || 0) - (x.addedAt || 0) || order.get(x.videoId)! - order.get(y.videoId)!);

  const plMap = new Map<string, UserPlaylist>();
  for (const p of [...(a.playlists || []), ...(b.playlists || [])]) {
    const prev = plMap.get(p.id);
    if (!prev || (p.updatedAt || p.createdAt) > (prev.updatedAt || prev.createdAt)) plMap.set(p.id, p);
  }
  const playlists = [...plMap.values()]
    .filter((p) => !dead(`pl:${p.id}`, p.updatedAt || p.createdAt))
    .sort((x, y) => y.createdAt - x.createdAt);

  const histMap = new Map<string, Track>();
  for (const t of [...(a.history || []), ...(b.history || [])]) {
    const prev = histMap.get(t.videoId);
    if (!prev || (t.playedAt || 0) > (prev.playedAt || 0)) histMap.set(t.videoId, t);
  }
  const history = [...histMap.values()]
    .filter((t) => (t.playedAt || 0) > (tomb.history || 0))
    .sort((x, y) => (y.playedAt || 0) - (x.playedAt || 0))
    .slice(0, 100);

  const folMap = new Map<string, FollowedArtist>();
  for (const f of [...(a.follows || []), ...(b.follows || [])]) {
    const prev = folMap.get(f.id);
    if (!prev || f.at > prev.at) folMap.set(f.id, f);
  }
  const follows = [...folMap.values()].filter((f) => !dead(`fol:${f.id}`, f.at)).sort((x, y) => y.at - x.at);

  const taste = !a.taste ? b.taste : !b.taste ? a.taste : (a.taste.updatedAt >= b.taste.updatedAt ? a.taste : b.taste);

  const sa = a.stats || ({} as SyncData['stats']);
  const sb = b.stats || ({} as SyncData['stats']);
  const songs: Record<string, SongStat> = { ...(sa.songs || {}) };
  for (const [k, v] of Object.entries(sb.songs || {})) {
    const p = songs[k];
    songs[k] = p ? { t: p.t, n: Math.max(p.n, v.n), s: Math.max(p.s, v.s), last: Math.max(p.last, v.last) } : v;
  }
  const artists: Record<string, ArtistStat> = { ...(sa.artists || {}) };
  for (const [k, v] of Object.entries(sb.artists || {})) {
    const p = artists[k];
    artists[k] = p ? { ...p, id: p.id || v.id, n: Math.max(p.n, v.n), s: Math.max(p.s, v.s) } : v;
  }
  const stats = {
    days: maxRec(sa.days, sb.days), songs, artists,
    totalS: Math.max(sa.totalS || 0, sb.totalS || 0), totalN: Math.max(sa.totalN || 0, sb.totalN || 0),
    since: Math.min(sa.since || Date.now(), sb.since || Date.now()),
    log: mergeLog(sa.log, sb.log),
  };
  return { v: 1, liked, playlists, history, follows, taste, stats, tomb };
}

let applying = false;
function apply(d: SyncData, uid: string) {
  applying = true;
  try {
    usePlayer.setState({ liked: d.liked || [], playlists: d.playlists || [], history: d.history || [] });
    useFollows.setState({ artists: d.follows || [] });
    if (d.stats) useStats.setState({ ...d.stats });
    if (d.taste) useTaste.setState((s) => ({ byUser: { ...s.byUser, [uid]: d.taste! } }));
    useSyncMeta.setState({ tomb: d.tomb || {} });
  } finally {
    applying = false;
  }
}

const sig = (d: SyncData) => JSON.stringify([d.liked, d.playlists, d.history, d.follows, d.taste, d.stats, d.tomb]);

let running: Promise<void> | null = null;
/** Tarik data akun, gabungkan dengan data di perangkat, lalu simpan kembali bila ada perubahan */
export function syncNow(): Promise<void> {
  if (running) return running;
  running = (async () => {
    const { token, user } = useAuth.getState();
    if (!token) return;
    useSyncStatus.setState({ state: 'syncing', error: null });
    try {
      const remote = await authApi<{ updatedAt: number; data: SyncData | null }>('sync', undefined, token);
      let base = remote.updatedAt;
      let remoteData = remote.data;
      for (let attempt = 0; attempt < 3; attempt++) {
        const merged = mergeData(collect(user.uid), remoteData);
        apply(merged, user.uid);
        if (remoteData && sig(merged) === sig(remoteData)) break; // server sudah sama
        try {
          const r = await authApi<{ updatedAt: number }>('sync', { base, data: merged }, token);
          base = r.updatedAt;
          break;
        } catch (e) {
          if (e instanceof AuthError && e.status === 409) { base = e.data.updatedAt; remoteData = e.data.data; continue; }
          throw e;
        }
      }
      useSyncMeta.setState({ base, lastSyncAt: Date.now(), dirty: false, owner: user.uid });
      useSyncStatus.setState({ state: 'idle', error: null });
    } catch (e: any) {
      if (e instanceof AuthError && e.status === 401) {
        useAuth.getState().clearSession();
        clearAccountData();
      }
      useSyncStatus.setState({ state: 'error', error: e?.message || 'Gagal sinkronisasi' });
    }
  })().finally(() => { running = null; });
  return running;
}

/**
 * Hapus data pustaka akun dari perangkat ini (dipakai saat keluar).
 * keepTaste: saat ganti/tambah akun, pilihan genre tetap disimpan per akun — kalau dihapus,
 * layar "pilih genre" langsung muncul untuk akun lama/akun tujuan (bug v4.4).
 */
export function clearAccountData(keepTaste = false) {
  applying = true;
  try {
    const uid = useAuth.getState().user.uid;
    usePlayer.setState({ liked: [], playlists: [], history: [] });
    useFollows.setState({ artists: [] });
    useStats.getState().reset();
    useSyncMeta.setState({ tomb: {}, base: 0, lastSyncAt: 0, dirty: false, owner: null });
    if (!keepTaste && uid !== LOCAL_USER.uid) useTaste.setState((s) => { const b = { ...s.byUser }; delete b[uid]; return { byUser: b }; });
  } finally {
    applying = false;
  }
}

/** Simpan perubahan akun aktif sebelum pindah; false bila pengguna membatalkan */
async function flushBeforeLeave(): Promise<boolean> {
  if (!useAuth.getState().token) return true;
  if (useSyncMeta.getState().dirty || timer) {
    clearTimeout(timer);
    timer = undefined;
    await syncNow();
    if (useSyncMeta.getState().dirty && !confirm('Ada perubahan yang belum tersinkron (offline?). Tetap lanjut? Perubahan itu akan hilang.')) return false;
  }
  if (running) await running;
  return true;
}

/** Hentikan musik akun sebelumnya (termasuk sesi Dengar bersama) sebelum berpindah akun */
async function stopForSwitch() {
  try {
    const { useTogether } = await import('../store/together');
    if (useTogether.getState().role) await (await import('./together')).disconnect(true);
  } catch { /* abaikan */ }
  usePlayer.getState().restoreIdle(null);
}

/** Siapkan lagu terakhir yang diputar akun aktif (dari riwayatnya) tanpa memutar */
export function restoreLastPlayed() {
  const last = usePlayer.getState().history[0];
  usePlayer.getState().restoreIdle(last || null);
}

/** Ganti ke akun tersimpan lain: simpan pustaka akun sekarang, kosongkan, lalu tarik pustaka akun tujuan */
export async function switchAccount(uid: string): Promise<boolean> {
  const a = useAuth.getState();
  if (a.token && a.user.uid === uid) return true;
  if (!navigator.onLine) {
    (await import('./toast')).toast('Ganti akun butuh internet');
    return false;
  }
  if (!(await flushBeforeLeave())) return false;
  const target = a.accounts.find((x) => x.user.uid === uid);
  if (!target) return false;
  // siapkan selera musik akun tujuan SEBELUM berpindah, supaya langsung masuk Beranda
  // (bukan layar pilih genre). Akun tersimpan pasti sudah pernah melewati layar itu.
  if (!useTaste.getState().byUser[uid]?.done) {
    let taste: Taste | undefined;
    try {
      const remote = await authApi<{ data: SyncData | null }>('sync', undefined, target.token, 8000);
      if (remote.data?.taste?.done) taste = remote.data.taste;
    } catch { /* lanjut — disinkronkan setelah berpindah */ }
    const fallback: Taste = { genres: [], artists: [], done: true, updatedAt: 0 };
    useTaste.setState((s) => {
      const local = s.byUser[uid];
      return { byUser: { ...s.byUser, [uid]: taste || (local ? { ...local, done: true } : fallback) } };
    });
  }
  // lagu akun sebelumnya dihentikan; setelah pindah, lagu terakhir akun tujuan disiapkan (tidak diputar)
  await stopForSwitch();
  if (a.token) clearAccountData(true);
  if (!useAuth.getState().selectAccount(uid)) return false;
  await syncNow();
  const now = useAuth.getState();
  if (now.token && now.user.uid === uid) {
    restoreLastPlayed();
    (await import('./toast')).toast(`Beralih ke ${now.user.name}`);
    return true;
  }
  return false; // sesi akun tujuan kedaluwarsa → layar masuk ditampilkan
}

/** Tambah akun: simpan & lepas akun sekarang (tetap tersimpan di daftar), lalu tampilkan layar masuk */
export async function addAccount(): Promise<boolean> {
  if (!(await flushBeforeLeave())) return false;
  await stopForSwitch();
  if (useAuth.getState().token) clearAccountData(true);
  useAuth.setState({ token: null, user: LOCAL_USER, guest: false });
  return true;
}

let timer: number | undefined;
let started = false;
/** Pantau perubahan pustaka → simpan otomatis (jeda 4 dtk; statistik saja: 60 dtk) */
export function startSync() {
  if (started) return;
  started = true;
  const schedule = (statsOnly: boolean) => {
    if (applying || !useAuth.getState().token) return;
    useSyncMeta.setState({ dirty: true });
    if (statsOnly && timer) return; // jangan menunda push yang sudah dijadwalkan
    clearTimeout(timer);
    timer = window.setTimeout(() => { timer = undefined; void syncNow(); }, statsOnly ? 60_000 : 4000);
  };
  usePlayer.subscribe((s, p) => { if (s.liked !== p.liked || s.playlists !== p.playlists || s.history !== p.history) schedule(false); });
  useFollows.subscribe((s, p) => { if (s.artists !== p.artists) schedule(false); });
  useTaste.subscribe((s, p) => { if (s.byUser !== p.byUser) schedule(false); });
  useStats.subscribe((s, p) => { if (s.totalS !== p.totalS) schedule(true); });
  let lastPull = 0;
  const pull = () => {
    if (!useAuth.getState().token || document.visibilityState !== 'visible' || Date.now() - lastPull < 60_000) return;
    lastPull = Date.now();
    void syncNow();
  };
  document.addEventListener('visibilitychange', pull);
  window.addEventListener('online', () => { lastPull = 0; pull(); });
  // simpan perubahan yang tertunda sebelum aplikasi ditutup
  window.addEventListener('pagehide', () => { if (useSyncMeta.getState().dirty && timer) { clearTimeout(timer); timer = undefined; void syncNow(); } });
}
