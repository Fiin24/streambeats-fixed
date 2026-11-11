import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Pause, Loader2 } from 'lucide-react';
import { usePlayer } from '../store/player';
import { dailyMixes, loadMix, type MixDef } from '../lib/mixes';
import { toast } from '../lib/toast';
import { SectionHeader } from './Shelf';
import { GlassLayers } from './Glass';
import { img } from '../lib/img';

/** Sampul Daily Mix ala Spotify: cover lagu + pita warna & label di bawah */
export function MixCover({ mix, className = '' }: { mix: MixDef; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-lg aspect-square ${className}`} style={{ background: mix.color }}>
      {mix.cover && <img src={img(mix.cover, 400)} alt="" loading="lazy" crossOrigin="anonymous" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover" />}
      <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 45%, ${mix.color}ee 100%)` }} />
      <span className="absolute top-2 left-2 text-[10px] font-black tracking-wide bg-black/35 backdrop-blur px-1.5 py-0.5 rounded">SB</span>
      <div className="absolute left-0 right-0 bottom-0 h-[6%]" style={{ background: mix.color }} />
      <p className="absolute left-2.5 bottom-[9%] right-2.5 text-white font-black text-[15px] sm:text-lg leading-tight drop-shadow whitespace-nowrap overflow-hidden text-ellipsis">{mix.title}</p>
    </div>
  );
}

export async function playMix(mix: MixDef) {
  try {
    const tracks = await loadMix(mix);
    usePlayer.getState().playList(tracks);
  } catch {
    toast('Gagal memuat mix, coba lagi');
  }
}

export default function DailyMixes() {
  const liked = usePlayer((s) => s.liked.length);
  const history = usePlayer((s) => s.history.length);
  const playing = usePlayer((s) => s.playing);
  const mixes = useMemo(() => dailyMixes(), [liked > 0, history > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  if (!mixes.length) return null;
  return (
    <section className="mb-8">
      <SectionHeader title="Dibuat untukmu" strapline="Daily Mix hari ini" />
      <div className="flex gap-4 overflow-x-auto no-scrollbar snap-x -mx-5 px-5 lg:mx-0 lg:px-0">
        {mixes.map((m) => {
          const on = active === m.id && playing;
          return (
            <div key={m.id} className="group w-[150px] sm:w-[180px] shrink-0 snap-start rounded-xl p-2 -m-2 hover:bg-white/[.06] transition">
              <div className="relative">
                <Link to={`/mix/${m.id}`} aria-label={m.title}><MixCover mix={m} /></Link>
                <button
                  aria-label={on ? 'Jeda' : `Putar ${m.title}`}
                  onClick={async () => {
                    if (on) return usePlayer.getState().toggle();
                    setBusy(m.id);
                    await playMix(m);
                    setActive(m.id);
                    setBusy(null);
                  }}
                  className="lg absolute right-2 top-2 w-11 h-11 rounded-full flex items-center justify-center shadow-xl lg:top-auto lg:bottom-10 lg:opacity-0 lg:translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition"
                  style={{ ['--tint' as any]: m.color }}
                >
                  <GlassLayers />
                  {busy === m.id ? <Loader2 className="w-5 h-5 animate-spin" /> : on ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
                </button>
              </div>
              <Link to={`/mix/${m.id}`} className="block mt-2 text-sm text-zinc-400 line-clamp-2 hover:text-zinc-200">{m.desc}</Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
