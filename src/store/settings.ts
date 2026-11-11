import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Item } from '../lib/types';

/** Hasil pencarian yang pernah dibuka (riwayat per kategori) */
export type RecentItem = Pick<Item, 'type' | 'id' | 'title' | 'subtitle' | 'thumbnail' | 'videoId' | 'playlistId' | 'browseId' | 'artists'> & { at: number };
export type DataSaver = 'off' | 'cellular' | 'always';

interface Settings {
  hl: string;
  gl: string;
  autoplayRadio: boolean;
  /** Efek liquid glass pada player & navigasi */
  glass: boolean;
  /** Durasi crossfade antarlagu (detik, 0 = mati) */
  crossfade: number;
  /** Tetap memutar saat aplikasi diminimalkan / layar dikunci */
  bgPlay: boolean;
  /** Unduhan: cari unggahan lain dari lagu yang sama bila versi aslinya gagal diunduh */
  dlAltVersions: boolean;
  /** Unduhan: mirror cadangan buatan pengguna (Piped/Invidious/Cobalt), satu per baris */
  dlMirrors: string;
  /** Notifikasi rilisan baru dari artis yang diikuti */
  releaseAlerts: boolean;
  /** Equalizer 5 pita (dB, -12…12) & nama preset */
  eqOn: boolean;
  eqPreset: string;
  eqGains: number[];
  /** Ratakan volume antarlagu */
  normalize: boolean;
  /** Hemat data: off | hanya di data seluler | selalu */
  dataSaver: DataSaver;
  /** APK: tampilkan baris lirik yang sedang dinyanyikan di notifikasi media / dynamic island */
  islandLyrics: boolean;
  recentSearches: string[];
  recentItems: RecentItem[];
  set: (p: Partial<Omit<Settings, 'set' | 'addRecent' | 'clearRecent' | 'addRecentItem' | 'removeRecentItem'>>) => void;
  addRecent: (q: string) => void;
  addRecentItem: (it: Item) => void;
  removeRecentItem: (id: string) => void;
  clearRecent: () => void;
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      hl: 'id',
      gl: 'ID',
      autoplayRadio: true,
      glass: true,
      // default mati: crossfade memotong beberapa detik akhir lagu → lagu terdengar tidak penuh
      crossfade: 0,
      bgPlay: true,
      dlAltVersions: true,
      dlMirrors: '',
      releaseAlerts: true,
      eqOn: false,
      eqPreset: 'flat',
      eqGains: [0, 0, 0, 0, 0],
      normalize: false,
      dataSaver: 'off',
      islandLyrics: true,
      recentSearches: [],
      recentItems: [],
      set: (p) => set(p),
      addRecent: (q) => set((s) => ({ recentSearches: [q, ...s.recentSearches.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 12) })),
      addRecentItem: (it) =>
        set((s) => {
          const r: RecentItem = {
            type: it.type, id: it.id, title: it.title, subtitle: it.subtitle, thumbnail: it.thumbnail,
            videoId: it.videoId, playlistId: it.playlistId, browseId: it.browseId, artists: (it.artists || []).slice(0, 2), at: Date.now(),
          };
          return { recentItems: [r, ...s.recentItems.filter((x) => x.id !== it.id)].slice(0, 40) };
        }),
      removeRecentItem: (id) => set((s) => ({ recentItems: s.recentItems.filter((x) => x.id !== id) })),
      clearRecent: () => set({ recentSearches: [], recentItems: [] }),
    }),
    {
      name: 'sb-settings',
      version: 2,
      // v0 → v1: matikan crossfade bawaan lama (6 dtk) agar akhir lagu tidak terpotong
      migrate: (state: any, version) => {
        if (version < 1 && state && state.crossfade === 6) state.crossfade = 0;
        // v1 → v2: Mode video dihapus
        if (version < 2 && state) delete state.videoMode;
        return state;
      },
    },
  ),
);
