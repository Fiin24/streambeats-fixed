import { useEffect, useState } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Item } from '../lib/types';
import Cover from './Cover';
import { useItemActions } from '../lib/actions';
import { usePlayer } from '../store/player';
import { img } from '../lib/img';
import { artistNames } from '../lib/format';

const KIND: Record<string, string> = { song: 'Lagu', video: 'Video', album: 'Album', playlist: 'Playlist', artist: 'Artis' };

/**
 * Sorotan utama Beranda: latar sampul yang diburamkan + sampul persegi yang tajam
 * (tidak lagi meregangkan thumbnail kecil jadi gambar lebar yang pecah).
 */
export default function Spotlight({ items }: { items: Item[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const { open, play } = useItemActions();
  const current = usePlayer((s) => s.current?.videoId);
  const playing = usePlayer((s) => s.playing);
  const toggle = usePlayer((s) => s.toggle);
  useEffect(() => {
    if (paused || items.length < 2) return;
    const t = setTimeout(() => setI((x) => (x + 1) % items.length), 6000);
    return () => clearTimeout(t);
  }, [i, items.length, paused]);
  if (!items.length) return null;
  const idx = i % items.length;
  const it = items[idx];
  const isCur = !!it.videoId && current === it.videoId;
  const go = (d: number) => setI((x) => (x + d + items.length) % items.length);

  return (
    <section className="mb-9">
      <div
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onClick={() => open(it)}
        className="group relative h-[200px] sm:h-[260px] lg:h-[300px] rounded-2xl overflow-hidden cursor-pointer bg-zinc-900 ring-1 ring-white/[.06]"
      >
        {/* latar: sampul diburamkan */}
        {items.map((x, k) => (
          <img
            key={x.id}
            src={img(x.thumbnail, 226)}
            alt=""
            aria-hidden
            referrerPolicy="no-referrer"
            className={`absolute inset-0 w-full h-full object-cover scale-150 blur-2xl saturate-150 transition-opacity duration-700 ${k === idx ? 'opacity-70' : 'opacity-0'}`}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

        <div key={it.id} className="relative h-full flex items-center gap-4 sm:gap-7 p-4 sm:p-7 animate-rise-in">
          <Cover
            src={it.thumbnail}
            size={544}
            alt={it.title}
            rounded={it.type === 'artist' ? 'rounded-full' : 'rounded-xl'}
            className="h-[128px] w-[128px] sm:h-[188px] sm:w-[188px] lg:h-[228px] lg:w-[228px] shrink-0 shadow-[0_18px_50px_rgba(0,0,0,.6)] group-hover:scale-[1.02] transition-transform duration-500"
          />
          <div className="min-w-0 flex-1 pr-12 sm:pr-16">
            <p className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur text-[11px] font-bold uppercase tracking-wider">
              Spotlight{KIND[it.type] ? ` · ${KIND[it.type]}` : ''}
            </p>
            <h3 className="mt-2.5 text-xl sm:text-3xl lg:text-[40px] font-black leading-tight tracking-tight line-clamp-2">{it.title}</h3>
            <p className="text-sm sm:text-base text-zinc-300 truncate mt-1.5">{artistNames(it) || it.subtitle}</p>
          </div>
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); isCur ? toggle() : play(it); }}
          aria-label={isCur && playing ? 'Jeda' : 'Putar'}
          className="absolute right-4 bottom-5 sm:right-7 sm:bottom-7 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-brand flex items-center justify-center shadow-[0_8px_24px_rgba(250,36,60,.45)] hover:scale-105 active:scale-95 transition"
        >
          {isCur && playing ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
        </button>

        {items.length > 1 && (
          <>
            <div className="absolute left-4 right-4 sm:left-7 sm:right-7 top-3 flex gap-1.5">
              {items.map((x, k) => (
                <button
                  key={x.id}
                  aria-label={`Slide ${k + 1}`}
                  onClick={(e) => { e.stopPropagation(); setI(k); }}
                  className="flex-1 h-[3px] rounded-full bg-white/25 overflow-hidden"
                >
                  <span
                    key={`${k}-${i}`}
                    className={`block h-full bg-white origin-left ${k < idx ? 'scale-x-100' : k === idx ? (paused ? 'scale-x-100' : 'animate-fill') : 'scale-x-0'}`}
                  />
                </button>
              ))}
            </div>
            <button onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Sebelumnya" className="hidden lg:flex absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 items-center justify-center opacity-0 group-hover:opacity-100 transition"><ChevronLeft className="w-5 h-5" /></button>
            <button onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Berikutnya" className="hidden lg:flex absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 items-center justify-center opacity-0 group-hover:opacity-100 transition"><ChevronRight className="w-5 h-5" /></button>
          </>
        )}
      </div>
    </section>
  );
}
