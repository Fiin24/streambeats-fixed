import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Mic2, Minus, Plus } from 'lucide-react';
import { engine } from '../lib/engine';
import { usePlayer } from '../store/player';
import { fetchLyrics, type Lyrics } from '../lib/lyrics';

/** Waktu pemutar yang halus (60 fps) agar sorotan karaoke bergerak mulus, bukan melompat tiap poll */
function useSmoothTime(on: boolean) {
  const base = usePlayer((s) => s.time);
  const playing = usePlayer((s) => s.playing);
  const [t, setT] = useState(base);
  useEffect(() => {
    if (!on || !playing) { setT(base); return; }
    let raf = 0;
    const tick = () => { const v = engine.currentTime(); setT(v || usePlayer.getState().time); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, playing, base]);
  return t;
}

const KARAOKE_KEY = 'sb-karaoke';
const offKey = (id: string) => `sb-lyr-off:${id}`;

/** Baris karaoke: warna mengisi kata demi kata sesuai progres baris (perkiraan per jumlah huruf) */
function KaraokeText({ text, progress, on, off }: { text: string; progress: number; on: string; off: string }) {
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  return (
    <span
      style={{
        backgroundImage: `linear-gradient(90deg, ${on} ${pct}%, ${off} ${Math.min(100, pct + 6)}%)`,
        WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', WebkitTextFillColor: 'transparent',
        boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone',
      }}
    >{text}</span>
  );
}

export default function LyricsView({ big = false, screen = false }: { big?: boolean; screen?: boolean }) {
  const current = usePlayer((s) => s.current);
  const duration = usePlayer((s) => s.duration);
  const [karaoke, setKaraoke] = useState(() => localStorage.getItem(KARAOKE_KEY) !== '0');
  const [offset, setOffset] = useState(0);
  useEffect(() => { setOffset(current ? Number(localStorage.getItem(offKey(current.videoId))) || 0 : 0); }, [current?.videoId]);
  const shiftOffset = (d: number) => {
    if (!current) return;
    const v = Math.round((offset + d) * 10) / 10;
    setOffset(v);
    if (v) localStorage.setItem(offKey(current.videoId), String(v)); else localStorage.removeItem(offKey(current.videoId));
  };
  const toggleKaraoke = () => { const v = !karaoke; setKaraoke(v); localStorage.setItem(KARAOKE_KEY, v ? '1' : '0'); };
  const time = useSmoothTime(karaoke) + offset;
  const seek = usePlayer((s) => s.seek);
  const [lyr, setLyr] = useState<Lyrics | null>(null);
  const [loading, setLoading] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const userScroll = useRef(0);

  useEffect(() => {
    if (!current) return;
    let alive = true;
    setLoading(true);
    setLyr(null);
    fetchLyrics(current, duration || undefined)
      .then((l) => alive && setLyr(l))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.videoId]);

  const active = useMemo(() => {
    if (!lyr?.synced) return -1;
    let i = -1;
    for (let k = 0; k < lyr.synced.length; k++) if (lyr.synced[k].time <= time + 0.25) i = k;
    return i;
  }, [lyr, time]);

  const progressOf = (i: number) => {
    if (!lyr?.synced || i !== active) return i < active ? 1 : 0;
    const start = lyr.synced[i].time - 0.25;
    const next = lyr.synced[i + 1]?.time ?? (duration || start + 5);
    // baris panjang tanpa jeda: batasi agar tidak terlalu lambat (≈ 0,35 dtk/huruf maksimum)
    const len = Math.min(next - start, Math.max(1.5, (lyr.synced[i].text.length || 1) * 0.35));
    return (time - start) / Math.max(0.3, len);
  };
  const toolbar = lyr?.synced ? (
    <div className={`sticky top-0 z-10 -mt-[26vh] mb-[26vh] flex items-center justify-end gap-1 ${screen ? 'text-black/70' : 'text-zinc-300'}`}>
      {karaoke && (
        <div className="flex items-center gap-1 rounded-full bg-black/20 backdrop-blur px-1 h-8 text-xs font-semibold" title="Geser waktu lirik bila tidak pas">
          <button onClick={() => shiftOffset(-0.3)} className="p-1" aria-label="Lirik lebih lambat"><Minus className="w-3.5 h-3.5" /></button>
          <span className="tabular-nums w-11 text-center">{offset > 0 ? '+' : ''}{offset.toFixed(1)}s</span>
          <button onClick={() => shiftOffset(0.3)} className="p-1" aria-label="Lirik lebih cepat"><Plus className="w-3.5 h-3.5" /></button>
        </div>
      )}
      <button onClick={toggleKaraoke} aria-pressed={karaoke} data-testid="karaoke-toggle"
        className={`flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-bold ${karaoke ? 'bg-white text-black' : 'bg-black/20 backdrop-blur'}`}>
        <Mic2 className="w-3.5 h-3.5" /> Karaoke
      </button>
    </div>
  ) : null;

  useEffect(() => {
    if (active < 0 || Date.now() - userScroll.current < 3000) return;
    const el = box.current?.querySelector<HTMLElement>(`[data-i="${active}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [active]);

  if (!current) return <p className="text-zinc-400 text-center mt-10">Putar lagu untuk melihat lirik</p>;
  if (loading) return <div className="flex justify-center mt-10"><Loader2 className={`w-6 h-6 animate-spin ${screen ? 'text-black/50' : 'text-zinc-400'}`} /></div>;
  if (!lyr?.synced && !lyr?.plain)
    return <p className={`text-center mt-10 ${screen ? 'text-2xl font-bold text-black/60' : 'text-zinc-400'}`}>Lirik tidak tersedia untuk lagu ini</p>;

  // Gaya Spotify: baris aktif putih, yang sudah lewat putih redup, yang akan datang gelap
  if (screen)
    return (
      <div ref={box} onWheel={() => (userScroll.current = Date.now())} onTouchMove={() => (userScroll.current = Date.now())} className="h-full overflow-y-auto no-scrollbar py-[28vh]">
        {toolbar}
        {lyr.synced ? (
          lyr.synced.map((l, i) => (
            <button
              key={i}
              data-i={i}
              onClick={() => { seek(l.time); userScroll.current = 0; }}
              className={`block w-full text-left font-extrabold tracking-tight leading-[1.18] text-[28px] sm:text-[34px] lg:text-[42px] my-3 lg:my-4 transition-colors duration-300
                ${i === active ? 'text-white' : i < active ? 'text-white/55 hover:text-white/80' : 'text-black/60 hover:text-black/80'}`}
            >
              {karaoke && i === active && l.text ? <KaraokeText text={l.text} progress={progressOf(i)} on="#ffffff" off="rgba(0,0,0,0.6)" /> : l.text || '♪'}
            </button>
          ))
        ) : (
          <>
            <p className="text-sm font-semibold text-black/60 mb-4">Lirik ini belum tersinkron dengan lagu</p>
            <p className="whitespace-pre-line font-extrabold tracking-tight text-[26px] lg:text-[34px] leading-snug text-white/90">{lyr.plain}</p>
          </>
        )}
        {lyr.source && <p className="text-sm font-semibold text-black/50 mt-10">Lirik dari {lyr.source}</p>}
      </div>
    );

  return (
    <div ref={box} onWheel={() => (userScroll.current = Date.now())} onTouchMove={() => (userScroll.current = Date.now())} className="h-full overflow-y-auto no-scrollbar py-[30vh] px-1">
      {toolbar}
      {lyr.synced ? (
        lyr.synced.map((l, i) => (
          <button
            key={i}
            data-i={i}
            onClick={() => { seek(l.time); userScroll.current = 0; }}
            className={`block w-full text-left font-bold leading-snug transition-all duration-300 my-3
              ${big ? 'text-2xl lg:text-4xl' : 'text-xl'}
              ${i === active ? 'text-white scale-[1.02] origin-left' : i < active ? 'text-white/40 hover:text-white/70' : 'text-white/30 hover:text-white/60'}`}
          >
            {karaoke && i === active && l.text ? <KaraokeText text={l.text} progress={progressOf(i)} on="#ffffff" off="rgba(255,255,255,0.35)" /> : l.text || '♪'}
          </button>
        ))
      ) : (
        <p className={`whitespace-pre-line font-semibold text-white/80 leading-relaxed ${big ? 'text-xl' : 'text-base'}`}>{lyr.plain}</p>
      )}
      {lyr.source && <p className="text-xs text-zinc-500 mt-8">Sumber: {lyr.source}</p>}
    </div>
  );
}
