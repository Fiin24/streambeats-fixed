import { Play, Pause } from 'lucide-react';
import type { Item } from '../lib/types';
import Cover from './Cover';
import { SectionHeader } from './Shelf';
import { useItemActions } from '../lib/actions';
import { usePlayer } from '../store/player';

export default function SpeedDial({ items }: { items: Item[] }) {
  const { open } = useItemActions();
  const current = usePlayer((s) => s.current?.videoId);
  const playing = usePlayer((s) => s.playing);
  const toggle = usePlayer((s) => s.toggle);
  if (!items.length) return null;
  return (
    <section className="mb-9">
      <SectionHeader title="Speed Dial" strapline="Putar cepat" />
      <div className="grid grid-rows-3 grid-flow-col auto-cols-[108px] sm:auto-cols-[132px] gap-2.5 overflow-x-auto no-scrollbar snap-x -mx-5 px-5 lg:mx-0 lg:px-0">
        {items.map((it) => {
          const cur = !!it.videoId && current === it.videoId;
          return (
            <div
              key={it.id}
              onClick={() => (cur ? toggle() : open(it))}
              className={`group relative aspect-square rounded-xl overflow-hidden cursor-pointer snap-start bg-zinc-800 ${cur ? 'ring-2 ring-spotify' : ''}`}
            >
              <Cover src={it.thumbnail} size={300} alt={it.title} rounded="" className="w-full h-full group-hover:scale-105 transition-transform duration-300" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
              <div className={`absolute inset-0 items-center justify-center ${cur ? 'flex' : 'hidden group-hover:flex'}`}>
                <span className="w-10 h-10 rounded-full bg-black/55 backdrop-blur flex items-center justify-center">
                  {cur && playing ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
                </span>
              </div>
              <p className="absolute left-2 right-2 bottom-2 text-[11px] sm:text-xs font-bold leading-tight line-clamp-2 text-shadow">{it.title}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
