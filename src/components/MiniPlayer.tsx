import { Play, Pause, Loader2 } from 'lucide-react';
import { usePlayer } from '../store/player';
import Cover from './Cover';
import LikeButton from './LikeButton';
import { GlassLayers } from './Glass';
import { artistNames } from '../lib/format';
import { useCoverColor } from '../lib/color';
import { useSwipe } from '../lib/gesture';

/** Mini player mobile — kaca cair, geser kiri/kanan untuk ganti lagu, ketuk untuk layar penuh */
export default function MiniPlayer() {
  const { current, playing, buffering, toggle, time, duration, setFullPlayer, fullPlayer, next, prev, queue, index } = usePlayer();
  const tint = useCoverColor(current?.thumbnail, current?.videoId);
  const { dx, dragging, handlers } = useSwipe(['x'], (_axis, d) => {
    if (d < -70) next();
    else if (d > 70) prev();
  });
  if (!current || fullPlayer) return null;
  const p = duration ? Math.min(100, (time / duration) * 100) : 0;
  const peek = dx < -24 ? queue[index + 1] : null;
  return (
    <div className="lg:hidden fixed left-3 right-3 z-30 bottom-[calc(env(safe-area-inset-bottom)+80px)] animate-slide-up">
      <div
        {...handlers}
        onClick={() => setFullPlayer(true)}
        style={{
          ['--tint' as any]: tint,
          transform: `translateX(${dx}px) rotate(${dx / 60}deg)`,
          transition: dragging ? 'none' : undefined,
          touchAction: 'pan-y',
        }}
        className="lg press relative flex items-center gap-3 p-2 pr-2.5 rounded-[22px] cursor-pointer select-none"
      >
        <GlassLayers />
        <Cover src={current.thumbnail} size={120} className="w-11 h-11 shrink-0 shadow-[0_4px_12px_rgba(0,0,0,.4)]" rounded="rounded-[14px]" />
        <div className="min-w-0 flex-1" style={{ opacity: 1 - Math.min(0.6, Math.abs(dx) / 160) }}>
          <p className="text-sm font-semibold truncate">{peek ? peek.title : current.title}</p>
          <p className="text-xs text-white/65 truncate">{peek ? `Berikutnya • ${artistNames(peek)}` : artistNames(current)}</p>
        </div>
        <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} className="flex items-center">
          <LikeButton track={current} size="w-6 h-6" className="p-2" />
          <button onClick={toggle} aria-label={playing ? 'Jeda' : 'Putar'} className="p-2 rounded-full active:scale-90 transition">
            {buffering && !playing ? <Loader2 className="w-6 h-6 animate-spin" /> : playing ? <Pause className="w-6 h-6 fill-white" /> : <Play className="w-6 h-6 fill-white" />}
          </button>
        </div>
        <div className="absolute left-4 right-4 bottom-[3px] h-[2px] bg-white/15 rounded-full overflow-hidden">
          <div className="h-full bg-white rounded-full transition-[width] duration-300 ease-linear" style={{ width: `${p}%` }} />
        </div>
      </div>
    </div>
  );
}
