/**
 * Cache playlist/album YouTube Music di perangkat agar tetap bisa dibuka saat offline
 * (lagu yang sudah diunduh di dalamnya tetap bisa diputar).
 */
import type { Track } from './types';

const KEY = 'sb-pl-cache';
const MAX_LISTS = 25;
const MAX_TRACKS = 300;

export interface CachedList { kind: string; title: string; subtitle?: string; description?: string; thumbnail?: string; tracks: Track[]; at: number }

const slim = (t: Track): Track => ({
  type: t.type, id: t.videoId, videoId: t.videoId, title: t.title, subtitle: t.subtitle, artists: t.artists,
  thumbnail: t.thumbnail, album: t.album, duration: t.duration, durationText: t.durationText, explicit: t.explicit,
});

function readAll(): Record<string, CachedList> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

export function loadPlCache(key: string): CachedList | null {
  return readAll()[key] || null;
}

export function savePlCache(key: string, v: Omit<CachedList, 'at'>) {
  const all = readAll();
  all[key] = { ...v, tracks: v.tracks.slice(0, MAX_TRACKS).map(slim), at: Date.now() };
  // simpan hanya yang terbaru
  const keep = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_LISTS);
  for (let n = keep.length; n > 0; n--) {
    try {
      localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(keep.slice(0, n))));
      return;
    } catch { /* penyimpanan penuh → buang yang paling lama */ }
  }
}
