/**
 * Rilisan baru dari artis yang diikuti → notifikasi di ikon lonceng.
 *
 * Cara kerja: halaman artis YouTube Music memuat rak "Album" & "Single & EP" (terbaru di depan).
 * Untuk tiap artis yang diikuti kita simpan daftar ID rilisan yang sudah pernah dilihat. Saat diperiksa
 * ulang (saat aplikasi dibuka, kembali ke aplikasi, atau tiap 30 menit — tiap artis paling sering 3 jam
 * sekali), rilisan yang belum pernah terlihat dan berasal dari tahun ini/tahun lalu menjadi notifikasi
 * baru (belum dibaca). Pemeriksaan pertama untuk artis yang baru diikuti hanya mencatat katalognya
 * (tanpa spam), dan rilisan tahun ini ditampilkan sebagai "sudah dibaca" agar daftar tidak kosong.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../lib/api';
import type { BrowsePage, Item } from '../lib/types';
import { toast } from '../lib/toast';
import { useFollows, type FollowedArtist } from './follows';
import { useSettings } from './settings';

export interface Release {
  /** browseId album/single (MPRE…) */
  id: string;
  artistId: string;
  artistName: string;
  artistThumb?: string;
  title: string;
  kind: 'Album' | 'Single' | 'EP';
  year?: number;
  thumbnail: string;
  playlistId?: string;
  /** waktu terdeteksi */
  at: number;
  read: boolean;
}

interface ReleaseState {
  items: Release[];
  /** artistId → ID rilisan yang sudah pernah terlihat */
  seen: Record<string, string[]>;
  /** artistId → waktu terakhir diperiksa */
  checkedAt: Record<string, number>;
  lastCheck: number;
  checking: boolean;
  /** periksa artis yang sudah waktunya (force = semua sekarang). Mengembalikan jumlah rilisan baru. */
  check: (force?: boolean) => Promise<number>;
  markRead: (id?: string) => void;
  clear: () => void;
}

const PER_ARTIST = 3 * 60 * 60 * 1000;
const MAX_ITEMS = 100;
const PARALLEL = 3;

const yearOf = (s = '') => { const m = s.match(/\b(19|20)\d{2}\b/); return m ? Number(m[0]) : undefined; };
function kindOf(section: string, it: Item): Release['kind'] {
  if (/\bEP\b/.test(it.subtitle || '')) return 'EP';
  if (/single/i.test(it.subtitle || '') || /single|\bEP\b/i.test(section)) return 'Single';
  return 'Album';
}

/** Ambil semua rilisan (album/single/EP) dari halaman artis, urutan asli (terbaru di depan) */
export function releasesOf(page: BrowsePage): { item: Item; kind: Release['kind'] }[] {
  const out: { item: Item; kind: Release['kind'] }[] = [];
  const seen = new Set<string>();
  for (const sec of page.sections) {
    for (const it of sec.items) {
      if (it.type !== 'album' || !it.browseId?.startsWith('MPRE') || seen.has(it.browseId)) continue;
      seen.add(it.browseId);
      out.push({ item: it, kind: kindOf(sec.title, it) });
    }
  }
  return out;
}

async function pool<T>(list: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) await fn(list[i++]);
  }));
}

export const useReleases = create<ReleaseState>()(
  persist(
    (set, get) => ({
      items: [],
      seen: {},
      checkedAt: {},
      lastCheck: 0,
      checking: false,

      check: async (force = false) => {
        if (get().checking) return 0;
        if (!useSettings.getState().releaseAlerts && !force) return 0;
        const artists = useFollows.getState().artists;
        const followed = new Set(artists.map((a) => a.id));
        // buang notifikasi dari artis yang sudah tidak diikuti
        if (get().items.some((r) => !followed.has(r.artistId))) set((s) => ({ items: s.items.filter((r) => followed.has(r.artistId)) }));
        if (!artists.length) return 0;
        const now = Date.now();
        const { checkedAt } = get();
        const due = artists
          .filter((a) => force || now - (checkedAt[a.id] || 0) > PER_ARTIST)
          .sort((a, b) => (checkedAt[a.id] || 0) - (checkedAt[b.id] || 0))
          .slice(0, force ? 80 : 25);
        if (!due.length) return 0;
        set({ checking: true });
        const thisYear = new Date().getFullYear();
        const fresh: Release[] = [];
        try {
          await pool(due, PARALLEL, async (a: FollowedArtist) => {
            let page: BrowsePage;
            try {
              page = await api<BrowsePage>({ action: 'browse', id: a.id }, false);
            } catch {
              return; // coba lagi di pemeriksaan berikutnya
            }
            const rels = releasesOf(page);
            const known = get().seen[a.id];
            const baseline = !known;
            const knownSet = new Set(known || []);
            let shown = 0;
            for (const { item, kind } of rels) {
              if (knownSet.has(item.browseId!)) continue;
              const year = yearOf(item.subtitle);
              const r: Release = {
                id: item.browseId!, artistId: a.id, artistName: page.title || a.name, artistThumb: a.thumbnail,
                title: item.title, kind, year, thumbnail: item.thumbnail, playlistId: item.playlistId, at: now, read: false,
              };
              if (baseline) {
                // artis baru diikuti: tampilkan rilisan tahun ini sebagai konteks, tanpa menandai "baru"
                if (year && year >= thisYear && shown++ < 2) fresh.push({ ...r, read: true });
              } else if (!year || year >= thisYear - 1) {
                fresh.push(r);
              }
            }
            set((s) => ({
              seen: { ...s.seen, [a.id]: [...new Set([...(s.seen[a.id] || []), ...rels.map((x) => x.item.browseId!)])].slice(-300) },
              checkedAt: { ...s.checkedAt, [a.id]: Date.now() },
            }));
          });
        } finally {
          set((s) => {
            const have = new Set(s.items.map((r) => r.id));
            const add = fresh.filter((r) => !have.has(r.id));
            return { checking: false, lastCheck: Date.now(), items: [...add, ...s.items].sort((x, y) => Number(x.read) - Number(y.read) || y.at - x.at).slice(0, MAX_ITEMS) };
          });
        }
        const unread = fresh.filter((r) => !r.read);
        if (unread.length === 1) toast(`🔔 Rilisan baru: ${unread[0].title} — ${unread[0].artistName}`);
        else if (unread.length > 1) toast(`🔔 ${unread.length} rilisan baru dari artis yang kamu ikuti`);
        return unread.length;
      },

      markRead: (id) => set((s) => ({ items: s.items.map((r) => (!id || r.id === id ? { ...r, read: true } : r)) })),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'sb-releases',
      partialize: (s) => ({ items: s.items, seen: s.seen, checkedAt: s.checkedAt, lastCheck: s.lastCheck }),
    },
  ),
);

export const useUnreadReleases = () => useReleases((s) => s.items.reduce((n, r) => n + (r.read ? 0 : 1), 0));

/** Jalankan pemeriksaan otomatis selama aplikasi terbuka */
export function useReleaseWatcher() {
  useEffect(() => {
    const run = () => { if (navigator.onLine !== false) void useReleases.getState().check(); };
    const first = window.setTimeout(run, 6000); // beri waktu beranda dimuat dulu
    const id = window.setInterval(run, 30 * 60 * 1000);
    const vis = () => { if (document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('online', run);
    // artis baru diikuti → catat katalognya segera
    let prev = new Set(useFollows.getState().artists.map((a) => a.id));
    const unsub = useFollows.subscribe((s) => {
      const added = s.artists.some((a) => !prev.has(a.id));
      prev = new Set(s.artists.map((a) => a.id));
      if (added) window.setTimeout(run, 1500);
    });
    return () => {
      clearTimeout(first);
      clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('online', run);
      unsub();
    };
  }, []);
}
