import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track } from '../lib/types';

/** Statistik mendengarkan (ala "Rekap"/Wrapped): menit per hari, lagu & artis teratas */
export interface SongStat { t: Track; n: number; s: number; last: number }
export interface ArtistStat { name: string; id?: string; thumb?: string; n: number; s: number }

interface StatsState {
  days: Record<string, number>; // detik per tanggal lokal (YYYY-MM-DD)
  songs: Record<string, SongStat>;
  artists: Record<string, ArtistStat>;
  totalS: number;
  totalN: number;
  since: number;
  /** log harian per lagu untuk Rekap periode: tanggal → videoId → [putar, detik] (hanya lokal) */
  log: Record<string, Record<string, [number, number]>>;
  /** tambah detik mendengarkan; countPlay = lagu ini baru saja dihitung sebagai 1x putar (≥30 dtk) */
  add: (t: Track, sec: number, countPlay: boolean) => void;
  reset: () => void;
}

export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const slim = (t: Track): Track => ({
  type: t.type, id: t.videoId, videoId: t.videoId, title: t.title, artists: t.artists, thumbnail: t.thumbnail, album: t.album, duration: t.duration,
} as Track);

const MAX_SONGS = 400;
const MAX_DAYS = 400;

export const useStats = create<StatsState>()(
  persist(
    (set) => ({
      days: {}, songs: {}, artists: {}, totalS: 0, totalN: 0, since: Date.now(), log: {},
      add: (t, sec, countPlay) =>
        set((s) => {
          const k = dayKey();
          const days = { ...s.days, [k]: (s.days[k] || 0) + sec };
          const dk = Object.keys(days);
          if (dk.length > MAX_DAYS) dk.sort().slice(0, dk.length - MAX_DAYS).forEach((x) => delete days[x]);
          const prev = s.songs[t.videoId];
          let songs = { ...s.songs, [t.videoId]: { t: prev?.t || slim(t), n: (prev?.n || 0) + (countPlay ? 1 : 0), s: (prev?.s || 0) + sec, last: Date.now() } };
          const ids = Object.keys(songs);
          if (ids.length > MAX_SONGS) {
            const keep = ids.sort((a, b) => songs[b].n - songs[a].n || songs[b].last - songs[a].last).slice(0, MAX_SONGS - 50);
            songs = Object.fromEntries(keep.map((id) => [id, songs[id]]));
          }
          const artists = { ...s.artists };
          for (const a of (t.artists || []).slice(0, 2)) {
            if (!a?.name) continue;
            const key = a.id || a.name.toLowerCase();
            const p = artists[key];
            artists[key] = { name: a.name, id: a.id || p?.id, thumb: p?.thumb, n: (p?.n || 0) + (countPlay ? 1 : 0), s: (p?.s || 0) + sec };
          }
          const today = s.log?.[k] || {};
          const e = today[t.videoId] || [0, 0];
          const log = { ...(s.log || {}), [k]: { ...today, [t.videoId]: [e[0] + (countPlay ? 1 : 0), e[1] + sec] as [number, number] } };
          const lk = Object.keys(log);
          if (lk.length > MAX_DAYS) lk.sort().slice(0, lk.length - MAX_DAYS).forEach((x) => delete log[x]);
          return { days, songs, artists, log, totalS: s.totalS + sec, totalN: s.totalN + (countPlay ? 1 : 0) };
        }),
      reset: () => set({ days: {}, songs: {}, artists: {}, totalS: 0, totalN: 0, since: Date.now(), log: {} }),
    }),
    { name: 'sb-stats' },
  ),
);

/** Hari beruntun mendengarkan (≥1 menit per hari), dihitung mundur dari hari ini/kemarin */
export function streak(days: Record<string, number>): number {
  let n = 0;
  const d = new Date();
  if (!(days[dayKey(d)] >= 60)) d.setDate(d.getDate() - 1);
  while (days[dayKey(d)] >= 60) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
