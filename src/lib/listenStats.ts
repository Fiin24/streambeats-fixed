import { useEffect } from 'react';
import { usePlayer } from '../store/player';
import { useStats } from '../store/stats';

const TICK = 5; // detik
const PLAY_AFTER = 30; // dihitung 1x putar setelah 30 detik didengar (seperti Spotify)

/** Rekam waktu mendengarkan untuk halaman Profil → Statistik */
export function useListenStats() {
  useEffect(() => {
    let vid: string | null = null;
    let heard = 0;
    let counted = false;
    const id = window.setInterval(() => {
      const s = usePlayer.getState();
      const t = s.current;
      if (!t) return;
      if (t.videoId !== vid) { vid = t.videoId; heard = 0; counted = false; }
      if (!s.playing || s.buffering) return;
      heard += TICK;
      const countNow = !counted && heard >= Math.min(PLAY_AFTER, Math.max(10, (s.duration || 60) * 0.5));
      if (countNow) counted = true;
      useStats.getState().add(t, TICK, countNow);
    }, TICK * 1000);
    return () => clearInterval(id);
  }, []);
}
