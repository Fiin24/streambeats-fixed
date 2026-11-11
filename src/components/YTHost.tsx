import { useEffect, useRef } from 'react';
import { engine } from '../lib/engine';
import { usePlayer } from '../store/player';
import { isDownloaded } from '../store/downloads';

/** Wadah tersembunyi untuk YouTube IFrame Player (sumber audio streaming) */
export default function YTHost() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = document.createElement('div');
    ref.current?.appendChild(el);
    const cur0 = usePlayer.getState().current;
    const restore = () => {
      const cur = usePlayer.getState().current;
      if (!cur) return;
      let at = 0;
      try {
        const r = JSON.parse(localStorage.getItem('sb-resume') || 'null');
        if (r?.v === cur.videoId) at = Number(r.t) || 0;
      } catch {
        /* abaikan */
      }
      if (at > 5) usePlayer.getState()._sync({ time: at });
      engine.restore(cur, at);
    };
    // lagu terakhir sudah diunduh → siapkan langsung (tidak menunggu YouTube, jadi jalan saat offline)
    const ready = engine.init(el);
    if (cur0 && isDownloaded(cur0.videoId)) restore();
    else ready.then(restore);
  }, []);
  return <div id="yt-host" ref={ref} aria-hidden="true" />;
}
