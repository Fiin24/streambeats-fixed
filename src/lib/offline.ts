/**
 * Mode offline ala Spotify: saat tidak ada internet, hanya lagu yang sudah DIUNDUH yang bisa diputar.
 * Lagu lain ditampilkan redup, tidak bisa diketuk, dan dilewati otomatis di antrean.
 */
import { useSyncExternalStore } from 'react';
import type { Track } from './types';
import { useDownloads } from '../store/downloads';

const subscribe = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

export const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

/** Hook status koneksi (re-render saat online/offline berubah) */
export const useOnline = () => useSyncExternalStore(subscribe, isOnline, () => true);

const downloaded = (id?: string) => !!id && !!useDownloads.getState().items[id];

/** Lagu bisa diputar sekarang? (online → semua, offline → hanya yang diunduh) */
export const canPlayNow = (t?: Pick<Track, 'videoId'> | null) =>
  !!t?.videoId && (downloaded(t.videoId) || (isOnline() && !t.videoId.startsWith('local:')));

/** Saat offline, sisakan hanya lagu yang sudah diunduh */
export const playableNow = <T extends Pick<Track, 'videoId'>>(list: T[]): T[] => list.filter((t) => canPlayNow(t));

/**
 * Cari indeks lagu terdekat yang bisa diputar mulai dari `from` ke arah `dir`.
 * `wrap` = boleh memutar balik ke awal/akhir antrean (ulangi semua).
 */
export function findPlayable(queue: Pick<Track, 'videoId'>[], from: number, dir: 1 | -1 = 1, wrap = false): number {
  const n = queue.length;
  if (!n) return -1;
  for (let k = 0; k < n; k++) {
    let i = from + k * dir;
    if (i < 0 || i >= n) {
      if (!wrap) return -1;
      i = ((i % n) + n) % n;
    }
    if (canPlayNow(queue[i])) return i;
  }
  return -1;
}

/** Hook: apakah lagu ini tidak tersedia (offline & belum diunduh) */
export function useUnavailable(videoId?: string) {
  const online = useOnline();
  const dl = useDownloads((s) => !!videoId && !!s.items[videoId]);
  // file lokal yang tidak ada di perangkat ini (mis. tersinkron dari HP lain) juga tidak bisa diputar
  return !dl && (!online || !!videoId?.startsWith('local:'));
}
