/** Playlist pintar: dibuat otomatis dari statistik mendengarkan, lagu disukai & riwayat (semua lokal) */
import { useMemo } from 'react';
import { usePlayer } from '../store/player';
import { useStats, dayKey } from '../store/stats';
import type { Track } from './types';

export interface SmartList { id: string; title: string; desc: string; tone: string; tracks: Track[] }

const DAY = 86_400_000;

function daysBack(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) { out.push(dayKey(d)); d.setDate(d.getDate() - 1); }
  return out;
}

export function useSmartLists(): SmartList[] {
  const songs = useStats((s) => s.songs);
  const log = useStats((s) => s.log);
  const liked = usePlayer((s) => s.liked);
  const history = usePlayer((s) => s.history);
  return useMemo(() => {
    const now = Date.now();
    const known = (id: string): Track | undefined =>
      songs[id]?.t || liked.find((t) => t.videoId === id) || history.find((t) => t.videoId === id);

    const ranked = (days: number, min: number) => {
      const sum: Record<string, number> = {};
      for (const k of daysBack(days)) for (const [id, [n, sec]] of Object.entries(log?.[k] || {})) sum[id] = (sum[id] || 0) + n + sec / 600;
      return Object.entries(sum)
        .filter(([, v]) => v >= min)
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => known(id))
        .filter((t): t is Track => !!t)
        .slice(0, 50);
    };

    const forgotten = Object.values(songs)
      .filter((x) => x.n >= 2 && now - x.last > 21 * DAY)
      .sort((a, b) => b.n - a.n)
      .map((x) => x.t);
    for (const t of liked) {
      if (forgotten.length >= 50) break;
      const st = songs[t.videoId];
      if ((!st || now - st.last > 30 * DAY) && !forgotten.some((f) => f.videoId === t.videoId) && now - (t.addedAt || 0) > 14 * DAY) forgotten.push(t);
    }

    return [
      { id: 'ulang', title: 'Lagi Sering Diulang', desc: 'Yang paling sering kamu putar 7 hari terakhir', tone: '#c2410c', tracks: ranked(7, 1) },
      { id: 'bulan-ini', title: 'Teratas Bulan Ini', desc: 'Lagu paling sering diputar dalam 30 hari', tone: '#1d4ed8', tracks: ranked(30, 1) },
      { id: 'baru-disukai', title: 'Baru Disukai', desc: 'Lagu yang kamu sukai dalam 30 hari terakhir', tone: '#be123c', tracks: liked.filter((t) => now - (t.addedAt || 0) < 30 * DAY).slice(0, 50) },
      { id: 'lama', title: 'Lama Tak Diputar', desc: 'Dulu sering didengar, sudah lama terlewat', tone: '#4d7c0f', tracks: forgotten.slice(0, 50) },
    ];
  }, [songs, log, liked, history]);
}
