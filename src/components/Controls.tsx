import { Shuffle, SkipBack, SkipForward, Repeat, Repeat1, Play, Pause, Loader2, Sparkles } from 'lucide-react';
import { usePlayer } from '../store/player';
import { fmtTime } from '../lib/format';
import { useRef, useState } from 'react';

export function Progress({ compact = false }: { compact?: boolean }) {
  const time = usePlayer((s) => s.time);
  const duration = usePlayer((s) => s.duration);
  const seek = usePlayer((s) => s.seek);
  const [drag, setDrag] = useState<number | null>(null);
  const held = useRef(false);
  const dragVal = useRef<number | null>(null);
  /** Selesai menggeser: lompat ke posisi terakhir (sekali saja walau beberapa event terpicu) */
  const commit = () => {
    held.current = false;
    const v = dragVal.current;
    dragVal.current = null;
    if (v != null) seek(v);
    setDrag(null);
  };
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const v = drag ?? time;
  const p = duration ? (v / duration) * 100 : 0;
  return (
    <div className={`flex items-center gap-2 w-full ${compact ? '' : 'text-xs'} text-zinc-400 tabular-nums`}>
      {!compact && <span className="w-10 text-right">{fmtTime(v)}</span>}
      <div
        className="relative flex-1"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = Math.min(Math.max(0, e.clientX - r.left), r.width);
          setHover({ x, t: (x / r.width) * (duration || 0) });
        }}
        onMouseLeave={() => setHover(null)}
      >
        {hover && duration > 0 && (
          <span className="absolute -top-7 -translate-x-1/2 px-1.5 py-0.5 rounded bg-black text-white text-[11px] pointer-events-none" style={{ left: hover.x }}>
            {fmtTime(hover.t)}
          </span>
        )}
        <input
          type="range"
          className="range block"
          min={0}
          max={duration || 1}
          step={0.1}
          value={v}
          style={{ ['--p' as any]: `${p}%` }}
          onPointerDown={() => { held.current = true; }}
          onChange={(e) => {
            const val = Number(e.target.value);
            dragVal.current = val;
            // klik/ketuk langsung atau tombol panah (tanpa menahan) → lompat sekarang
            if (!held.current) { seek(val); setDrag(null); dragVal.current = null; }
            else setDrag(val);
          }}
          onPointerUp={commit}
          onPointerCancel={commit}
          onLostPointerCapture={commit}
          onMouseUp={commit}
          onTouchEnd={commit}
          onTouchCancel={commit}
          onKeyUp={commit}
          onBlur={commit}
          aria-label="Posisi lagu"
        />
      </div>
      {!compact && <span className="w-10">{fmtTime(duration)}</span>}
    </div>
  );
}

export function PlayButton({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering);
  const toggle = usePlayer((s) => s.toggle);
  const big = size === 'lg';
  return (
    <button
      onClick={toggle}
      aria-label={playing ? 'Jeda' : 'Putar'}
      className={`${big ? 'w-16 h-16' : 'w-8 h-8'} rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition`}
    >
      {buffering && !playing ? (
        <Loader2 className={`${big ? 'w-7 h-7' : 'w-4 h-4'} animate-spin`} />
      ) : playing ? (
        <Pause className={`${big ? 'w-7 h-7' : 'w-4 h-4'} fill-black`} />
      ) : (
        <Play className={`${big ? 'w-7 h-7 ml-1' : 'w-4 h-4 ml-0.5'} fill-black`} />
      )}
    </button>
  );
}

export function Transport({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const { shuffle, smart, repeat, toggleShuffle, cycleRepeat, next, prev } = usePlayer();
  const big = size === 'lg';
  const ic = big ? 'w-7 h-7' : 'w-5 h-5';
  const btn = 'relative p-1.5 rounded-full transition hover:scale-105 active:scale-95';
  return (
    <div className={`flex items-center ${big ? 'justify-between w-full max-w-sm' : 'gap-4'}`}>
      <button
        onClick={toggleShuffle}
        aria-label={smart ? 'Acak cerdas' : shuffle ? 'Acak aktif' : 'Acak'}
        title={smart ? 'Acak cerdas: aktif' : shuffle ? 'Acak: aktif (klik lagi untuk Acak Cerdas)' : 'Acak'}
        className={`${btn} ${shuffle ? 'text-spotify' : 'text-zinc-400 hover:text-white'}`}
      >
        <Shuffle className={big ? 'w-6 h-6' : 'w-4 h-4'} />
        {smart && <Sparkles className={`absolute ${big ? 'w-3.5 h-3.5 top-0 right-0' : 'w-2.5 h-2.5 top-0.5 right-0'} fill-current`} />}
        {shuffle && <span className="absolute left-1/2 -translate-x-1/2 bottom-0 w-1 h-1 rounded-full bg-spotify" />}
      </button>
      <button onClick={prev} aria-label="Sebelumnya" className={`${btn} text-zinc-300 hover:text-white`}><SkipBack className={`${ic} fill-current`} /></button>
      <PlayButton size={size} />
      <button onClick={() => next()} aria-label="Berikutnya" className={`${btn} text-zinc-300 hover:text-white`}><SkipForward className={`${ic} fill-current`} /></button>
      <button onClick={cycleRepeat} aria-label="Ulangi" className={`${btn} ${repeat !== 'off' ? 'text-spotify' : 'text-zinc-400 hover:text-white'}`}>
        {repeat === 'one' ? <Repeat1 className={big ? 'w-6 h-6' : 'w-4 h-4'} /> : <Repeat className={big ? 'w-6 h-6' : 'w-4 h-4'} />}
        {repeat !== 'off' && <span className="absolute left-1/2 -translate-x-1/2 bottom-0 w-1 h-1 rounded-full bg-spotify" />}
      </button>
    </div>
  );
}
