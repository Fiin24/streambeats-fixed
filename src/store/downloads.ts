/**
 * Unduhan offline: audio disimpan di IndexedDB perangkat, metadata di localStorage.
 * Audio diambil per potongan dari /api/dl (≤ 3,5 MB per permintaan, aman untuk batas Vercel).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track } from '../lib/types';
import { audioDb } from '../lib/idb';
import { img } from '../lib/img';
import { toast } from '../lib/toast';
import { deviceDownloadSupported, downloadOnDevice } from '../lib/deviceDl';
import { nativeSaveAvailable, saveBlobNative } from '../lib/fileSaver';
import { isNativeApp } from '../lib/native';
import { downloadViaMirrors, findAlternatives } from '../lib/altSources';
import { useSettings } from './settings';

export interface DownloadMeta {
  track: Track; size: number; mime: string; at: number;
  /** sumber unduhan, mis. "youtube-hp", "server", "piped:host", atau "versi lain" */
  via?: string;
  /** videoId unggahan lain yang dipakai bila versi asli gagal ("link lain") */
  altOf?: string;
}

interface DlState {
  /** lagu yang sudah selesai diunduh (disimpan) */
  items: Record<string, DownloadMeta>;
  /** progres 0..1 lagu yang sedang diunduh */
  active: Record<string, number>;
  /** info lagu yang sedang diunduh */
  working: Record<string, Track>;
  /** antrean unduhan (belum mulai) */
  pending: Track[];
  /** lagu yang gagal pada sesi ini */
  failed: Record<string, { track: Track; error: string }>;
  enqueue: (tracks: Track[]) => number;
  cancel: (videoId: string) => void;
  cancelAll: () => void;
  remove: (videoId: string) => Promise<void>;
  removeMany: (ids: string[]) => Promise<void>;
  clearAll: () => Promise<void>;
  retryFailed: () => void;
  /** Impor file audio milik sendiri dari HP/komputer ke Lagu Diunduh (bisa diputar offline) */
  importFiles: (files: File[]) => Promise<number>;
}

const CHUNK = 3 * 1024 * 1024;
const PARALLEL = 2;
const controllers = new Map<string, AbortController>();
let running = 0;

const slim = (t: Track): Track => ({
  type: t.type, id: t.videoId, videoId: t.videoId, title: t.title, subtitle: t.subtitle, artists: t.artists,
  thumbnail: t.thumbnail, album: t.album, duration: t.duration, durationText: t.durationText, explicit: t.explicit,
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ringkas pesan error unduhan agar muat di toast & daftar gagal */
export function shortDlError(msg?: string): string {
  const m = String(msg || '');
  if (/semua sumber gagal/i.test(m)) return /diblokir|not a bot|sign in/i.test(m) ? 'Diblokir YouTube & semua sumber cadangan gagal' : 'Semua sumber gagal';
  if (/memblokir|diblokir|not a bot|sign in|login_required/i.test(m)) return 'Diblokir YouTube (coba "Link Lain")';
  if (/quota/i.test(m)) return 'Penyimpanan penuh';
  if (/koneksi|network|jaringan|failed to fetch|timeout/i.test(m)) return 'Koneksi bermasalah';
  if (/tidak tersedia|unavailable|private/i.test(m)) return 'Lagu tidak tersedia';
  if (/memotong unduhan|potong|1 MB/i.test(m)) return 'Butuh token YouTube (coba "Link Lain")';
  if (/mirror|piped|invidious|cobalt/i.test(m)) return 'Sumber cadangan gagal';
  if (/audio tidak valid|ukuran/i.test(m)) return 'File audio rusak';
  return m.length > 48 ? `${m.slice(0, 45)}…` : m || 'Coba lagi';
}

/** Satu toast untuk banyak kegagalan beruntun (bukan satu toast per lagu) */
let failBatch: { n: number; reason: string; at: number } | null = null;
function failToast(title: string, msg?: string) {
  const reason = shortDlError(msg);
  const now = Date.now();
  if (failBatch && now - failBatch.at < 8000) {
    failBatch = { n: failBatch.n + 1, reason, at: now };
    toast(`Gagal unduh ${failBatch.n} lagu · ${reason}`);
  } else {
    failBatch = { n: 1, reason, at: now };
    const t = title.length > 28 ? `${title.slice(0, 26)}…` : title;
    toast(`Gagal unduh "${t}" · ${reason}`);
  }
}

/** ID lagu dari file yang diimpor pengguna (bukan dari YouTube) */
export const isLocalId = (id?: string) => !!id && id.startsWith('local:');

/** Baca durasi file audio (detik) — 0 bila tidak terbaca */
function audioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const a = new Audio();
    const url = URL.createObjectURL(blob);
    const done = (d: number) => { URL.revokeObjectURL(url); resolve(isFinite(d) && d > 0 ? Math.round(d) : 0); };
    const to = setTimeout(() => done(0), 6000);
    a.preload = 'metadata';
    a.onloadedmetadata = () => { clearTimeout(to); done(a.duration); };
    a.onerror = () => { clearTimeout(to); done(0); };
    a.src = url;
  });
}

/** "Artis - Judul.mp3" → { artist, title } */
function parseName(file: string) {
  const base = file.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_]+/g, ' ').trim();
  const m = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: '', title: base };
}

/** Simpan sampul ke cache service worker agar tetap tampil saat offline */
async function cacheCovers(t: Track) {
  if (!('caches' in window) || !t.thumbnail) return;
  try {
    const c = await caches.open('sb-covers');
    const urls = [...new Set([t.thumbnail, ...[96, 120, 300, 400, 512, 600].map((s) => img(t.thumbnail, s))])];
    await Promise.all(urls.map(async (u) => {
      if (await c.match(u)) return;
      // <Cover> memakai crossOrigin="anonymous" → simpan respons CORS (bukan opaque) agar cocok saat offline
      const r = await fetch(u, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' }).catch(() => null);
      if (r?.ok) await c.put(u, r).catch(() => undefined);
    }));
  } catch { /* abaikan */ }
}

interface Fetched { blob: Blob; via: string; altOf?: string }
type Progress = (p: number) => void;
const errText = (e: any) => String(e?.message || e || 'gagal').slice(0, 140);

/** Coba semua sumber untuk SATU videoId. null bila semuanya gagal (alasan dicatat di errs). */
async function fetchOne(videoId: string, signal: AbortSignal, onProgress: Progress, errs: string[], label = ''): Promise<Fetched | null> {
  const tag = (s: string) => (label ? `${label} ${s}` : s);
  const attempt = async (name: string, fn: () => Promise<Fetched>): Promise<Fetched | null> => {
    try {
      return await fn();
    } catch (e: any) {
      if (signal.aborted) throw e;
      errs.push(`${tag(name)}: ${errText(e)}`);
      console.warn('[unduh]', tag(name), 'gagal', e);
      onProgress(0);
      return null;
    }
  };
  const device = () => attempt('YouTube (HP)', async () => ({ blob: await downloadOnDevice(videoId, signal, onProgress), via: 'youtube-hp' }));
  const server = () => attempt('Server', async () => ({ blob: await fetchAudioServer(videoId, signal, onProgress), via: 'server' }));
  const mirror = () => attempt('Mirror', async () => { const r = await downloadViaMirrors(videoId, signal, onProgress); return { blob: r.blob, via: r.source }; });
  // APK: langsung dari HP → mirror dari HP → server (mirror sering lebih andal). Browser: server → mirror dari browser.
  const order = deviceDownloadSupported() ? [device, mirror, server] : [server, mirror];
  // Coba 2 ronde: ronde pertama semua sumber, ronde kedua ulang sumber yang belum dicoba
  for (let round = 0; round < 2; round++) {
    for (const step of order) {
      const r = await step();
      if (r && r.blob.size >= 10_000) return r;
    }
    // Tunggu sebentar sebelum ronde berikutnya
    await new Promise((ok) => setTimeout(ok, 1000));
  }
  return null;
}

/**
 * Ambil audio untuk diputar offline. Urutan:
 *  1. lagu itu sendiri lewat YouTube (HP / server), lalu mirror cadangan (Piped/Invidious/Cobalt)
 *  2. bila tetap gagal: cari "link lain" — unggahan lain dari lagu yang sama — dan unduh versi itu.
 * Hasil tetap disimpan dengan videoId asli, jadi lagu bisa langsung diputar offline dari daftar mana pun.
 */
/** Dipakai pemutar: ambil audio lagu (tanpa menyimpan) agar Equalizer bisa diterapkan saat streaming */
export async function fetchStreamBlob(t: Track, signal: AbortSignal): Promise<Blob> {
  return (await fetchAudio(t, signal, () => {}, true)).blob;
}

async function fetchAudio(t: Track, signal: AbortSignal, onProgress: Progress, forceAlt = false): Promise<Fetched> {
  const errs: string[] = [];
  const own = await fetchOne(t.videoId, signal, onProgress, errs);
  if (own) return own;
  
  // Check if we should try alternative versions
  const shouldTryAlt = forceAlt || useSettings.getState().dlAltVersions;
  if (shouldTryAlt) {
    let alts: Track[] = [];
    try { alts = await findAlternatives(t, 3); } catch (e) { errs.push(`Cari versi lain: ${errText(e)}`); }
    if (!alts.length) errs.push('Versi lain: tidak ditemukan');
    for (const alt of alts) {
      if (signal.aborted) throw new DOMException('Dibatalkan', 'AbortError');
      const r = await fetchOne(alt.videoId, signal, onProgress, errs, `[versi lain ${alt.videoId}]`);
      if (r) return { ...r, via: `versi lain · ${r.via}`, altOf: alt.videoId };
    }
  }
  
  // Build a more informative error message
  const errorMessages = errs.slice(-5).join(' | ');
  const blocked = errs.some((e) => /diblokir|memblokir|not a bot|sign in/i.test(e));
  const needsToken = errs.some((e) => /token|memotong|1 MB/i.test(e));
  const mirrorFailed = errs.some((e) => /mirror|piped|invidious|cobalt/i.test(e));
  
  let userMessage = 'Semua sumber gagal';
  if (blocked && needsToken) {
    userMessage += ' · YouTube memblokir & butuh token · Coba "Link Lain" di menu lagu';
  } else if (blocked) {
    userMessage += ' · Diblokir YouTube · Coba "Link Lain" atau coba lagi nanti';
  } else if (needsToken) {
    userMessage += ' · Butuh token YouTube · Coba "Link Lain"';
  } else if (mirrorFailed && blocked) {
    userMessage += ' · Server & mirror diblokir · Coba "Link Lain"';
  } else if (mirrorFailed) {
    userMessage += ' · Mirror gagal · Coba lagi atau "Link Lain"';
  }
  
  throw new Error(`${userMessage}: ${errorMessages}`);
}

/** Pesan error server yang tidak akan berubah bila diulang (mis. IP server diblokir) */
const permanent = (msg: string) => /memblokir|diblokir|not a bot|sign in|tidak valid|private|unavailable|tidak tersedia|mirror|HTTP 403|token/i.test(msg);

async function fetchAudioServer(videoId: string, signal: AbortSignal, onProgress: (p: number) => void): Promise<Blob> {
  const saved = await audioDb.getPartial(videoId).catch(() => undefined);
  const partial = saved?.source === 'server' ? saved : undefined;
  const parts: Blob[] = partial?.chunks?.slice() || [];
  let start = partial?.size || 0, total = partial?.total || Infinity, mime = partial?.mime || 'audio/mp4';
  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 3;
  
  while (start < total) {
    let res: Response | null = null;
    let lastErr = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        res = await fetch(`/api/dl?id=${encodeURIComponent(videoId)}&start=${start}&end=${start + CHUNK - 1}`, { signal, cache: 'no-store' });
        if (res.ok) break;
        const j = await res.json().catch(() => ({}));
        lastErr = j.error || `HTTP ${res.status}`;
        
        // Don't retry permanent errors
        if (res.status === 400 || res.status === 404 || permanent(lastErr)) {
          consecutiveFailures = MAX_CONSECUTIVE_FAILURES; // Force exit
          break;
        }
        
        // Check for bot detection in response body
        const contentType = res.headers.get('Content-Type') || '';
        if (/text\/html/.test(contentType)) { 
          lastErr = 'Fungsi /api/dl tidak ditemukan di server (cek deploy)'; 
          consecutiveFailures = MAX_CONSECUTIVE_FAILURES;
          break; 
        }
      } catch (e: any) {
        if (signal.aborted) throw e;
        lastErr = e?.message || 'Jaringan bermasalah';
      }
      res = null;
      await sleep(800 * (attempt + 1) + Math.random() * 500); // Add jitter
    }
    
    if (!res?.ok) {
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        throw new Error(lastErr || 'Gagal mengunduh setelah beberapa percobaan');
      }
      continue;
    }
    
    consecutiveFailures = 0; // Reset on success
    const ct = res.headers.get('Content-Type') || '';
    if (/text\/html|application\/json/.test(ct)) throw new Error('Server tidak mengirim audio — pastikan fungsi /api/dl ikut ter-deploy');
    total = Number(res.headers.get('X-Total-Length')) || 0;
    mime = (ct || mime).split(';')[0];
    const buf = await res.arrayBuffer();
    if (!buf.byteLength) break;
    parts.push(new Blob([buf], { type: mime }));
    start += buf.byteLength;
    if (!total) total = start; // server tidak tahu ukuran → anggap selesai
    await audioDb.putPartial(videoId, { videoId, chunks: parts, size: start, total: Number.isFinite(total) ? total : undefined, source: 'server', mime, updatedAt: Date.now() }).catch(() => undefined);
    onProgress(Math.min(1, start / total));
  }
  return new Blob(parts, { type: mime });
}

export const useDownloads = create<DlState>()(
  persist(
    (set, get) => {
      const pump = () => {
        while (running < PARALLEL && get().pending.length) {
          const [t, ...rest] = get().pending;
          set({ pending: rest });
          running++;
          run(t).finally(() => { running--; pump(); });
        }
      };

      const run = async (t: Track) => {
        const id = t.videoId;
        if (get().items[id]) return;
        const ac = new AbortController();
        controllers.set(id, ac);
        set((s) => ({ active: { ...s.active, [id]: 0 }, working: { ...s.working, [id]: slim(t) } }));
        try {
          let lastUi = 0;
          const { blob, via, altOf } = await fetchAudio(t, ac.signal, (p) => {
            const now = Date.now();
            if (now - lastUi > 250 || p >= 1) { lastUi = now; set((s) => ({ active: { ...s.active, [id]: p } })); }
          });
          if (blob.size < 10_000) throw new Error('File audio tidak valid (terlalu kecil)');
          await audioDb.put(id, blob);
          await audioDb.delPartial(id).catch(() => undefined);
          cacheCovers(t);
          set((s) => {
            const { [id]: _, ...active } = s.active;
            const { [id]: __, ...failed } = s.failed;
            const { [id]: ___, ...working } = s.working;
            return { active, failed, working, items: { ...s.items, [id]: { track: slim(t), size: blob.size, mime: blob.type, at: Date.now(), via, altOf } } };
          });
          if (!get().pending.length && running <= 1 && !Object.keys(get().active).length) toast('Unduhan selesai — bisa diputar offline');
        } catch (e: any) {
          const aborted = ac.signal.aborted;
          set((s) => {
            const { [id]: _, ...active } = s.active;
            const { [id]: __, ...working } = s.working;
            return { active, working, failed: aborted ? s.failed : { ...s.failed, [id]: { track: slim(t), error: shortDlError(e?.message) } } };
          });
          if (!aborted) {
            console.warn('[unduh] gagal', id, e);
            const errMsg = String(e?.message || e);
            if (/quota/i.test(String(e?.name || e?.message))) toast('Penyimpanan perangkat penuh — hapus beberapa unduhan');
            else if (/diblokir.*token|butuh token/i.test(errMsg)) {
              toast(`YouTube butuh token untuk "${t.title}" · Coba "Link Lain" di menu lagu`);
            } else if (/diblokir|not a bot/i.test(errMsg)) {
              toast(`Diblokir YouTube untuk "${t.title}" · Coba "Link Lain" atau coba lagi nanti`);
            } else if (/versi lain.*tidak ditemukan/i.test(errMsg)) {
              toast(`Tidak ada versi lain untuk "${t.title}" · Coba lagi nanti`);
            } else {
              failToast(t.title, e?.message);
            }
          }
        } finally {
          controllers.delete(id);
        }
      };

      return {
        items: {},
        active: {},
        working: {},
        pending: [],
        failed: {},
        enqueue: (tracks) => {
          const s = get();
          const seen = new Set([...Object.keys(s.items), ...Object.keys(s.active), ...s.pending.map((p) => p.videoId)]);
          const add = tracks
            .filter((t) => t?.videoId && !seen.has(t.videoId))
            .map((t) => {
              seen.add(t.videoId); // tandai agar duplikat dalam batch tidak masuk
              return slim(t);
            });
          if (!add.length) return 0;
          set({ pending: [...s.pending, ...add] });
          // minta browser tidak menghapus data otomatis saat ruang menipis
          navigator.storage?.persist?.().catch(() => undefined);
          pump();
          return add.length;
        },
        cancel: (id) => {
          controllers.get(id)?.abort();
          set((s) => ({ pending: s.pending.filter((p) => p.videoId !== id) }));
        },
        cancelAll: () => {
          set({ pending: [] });
          for (const c of controllers.values()) c.abort();
        },
        remove: async (id) => {
          get().cancel(id);
          await audioDb.del(id).catch(() => undefined);
          set((s) => { const { [id]: _, ...items } = s.items; return { items }; });
        },
        removeMany: async (ids) => {
          for (const id of ids) {
            get().cancel(id);
            await audioDb.del(id).catch(() => undefined);
          }
          set((s) => { const items = { ...s.items }; for (const id of ids) delete items[id]; return { items }; });
        },
        clearAll: async () => {
          get().cancelAll();
          await audioDb.clear().catch(() => undefined);
          set({ items: {}, failed: {} });
        },
        retryFailed: () => {
          const s = get();
          const tracks = Object.values(s.failed).map((f) => f.track);
          set({ failed: {} });
          if (tracks.length) get().enqueue(tracks);
        },
        importFiles: async (files) => {
          let ok = 0;
          for (const f of files) {
            if (!/^audio\//.test(f.type) && !/\.(mp3|m4a|aac|ogg|opus|wav|flac|webm)$/i.test(f.name)) continue;
            try {
              const id = `local:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
              const { artist, title } = parseName(f.name);
              const duration = await audioDuration(f);
              await audioDb.put(id, f);
              const track: Track = {
                type: 'song', id, videoId: id, title: title || f.name, subtitle: artist || 'File lokal',
                artists: artist ? [{ name: artist }] : [], thumbnail: '', duration: duration || undefined,
              } as Track;
              set((s) => ({ items: { ...s.items, [id]: { track, size: f.size, mime: f.type || 'audio/mpeg', at: Date.now() } } }));
              ok++;
            } catch (e: any) {
              toast(/quota/i.test(String(e?.name || e?.message)) ? 'Penyimpanan perangkat penuh' : `Gagal impor "${f.name}"`);
            }
          }
          navigator.storage?.persist?.().catch(() => undefined);
          return ok;
        },
      };
    },
    {
      name: 'sb-downloads',
      partialize: (s) => ({ items: s.items }),
      // sinkronkan metadata dengan isi IndexedDB (mis. data dihapus browser)
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        audioDb.keys().then((keys) => {
          const have = new Set(keys.map(String));
          const items = useDownloads.getState().items;
          const missing = Object.keys(items).filter((id) => !have.has(id));
          if (missing.length) useDownloads.setState((s) => { const it = { ...s.items }; for (const id of missing) delete it[id]; return { items: it }; });
        }).catch(() => undefined);
      },
    },
  ),
);

export const isDownloaded = (videoId?: string) => !!videoId && !!useDownloads.getState().items[videoId];

/** Ambil blob audio offline (atau null bila belum diunduh) */
export async function getOfflineBlob(videoId: string): Promise<Blob | null> {
  if (!isDownloaded(videoId)) return null;
  try {
    const b = await audioDb.get(videoId);
    return b && b.size ? b : null;
  } catch {
    return null;
  }
}

/** Simpan file audio unduhan ke folder perangkat (APK: Music/Stream Beats, browser: folder Download) */
export async function exportToDevice(t: Track) {
  const blob = await getOfflineBlob(t.videoId);
  if (!blob) return toast('Lagu ini belum diunduh');
  const ext = blob.type.includes('webm') ? 'webm' : blob.type.includes('mpeg') ? 'mp3' : 'm4a';
  const artist = t.artists?.map((a) => a.name).join(', ') || t.subtitle || '';
  const name = `${artist ? `${artist} - ` : ''}${t.title}`.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 150);
  const fileName = `${name}.${ext}`;
  // Di WebView Android, <a download> dengan blob: tidak berfungsi → simpan lewat plugin native
  if (isNativeApp()) {
    if (!nativeSaveAvailable()) return toast('Perbarui APK Stream Beats untuk menyimpan file ke perangkat');
    try {
      toast('Menyimpan file…');
      const where = await saveBlobNative(blob, fileName);
      toast(`Tersimpan di ${where}`);
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (/permission|izin/i.test(msg)) toast('Izin penyimpanan ditolak · Buka pengaturan aplikasi');
      else if (/space|quota|penuh/i.test(msg)) toast('Penyimpanan penuh · Hapus file tidak perlu');
      else toast(`Gagal menyimpan: ${msg || 'coba lagi'}`);
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  toast('File disimpan ke folder Download');
}

export const fmtBytes = (n: number) =>
  n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
