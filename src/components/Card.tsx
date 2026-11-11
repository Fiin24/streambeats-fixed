import { Play, Pause } from 'lucide-react';
import type { Item } from '../lib/types';
import Cover from './Cover';
import { usePlayer } from '../store/player';
import { useItemActions } from '../lib/actions';
import { useSearchRecorder } from '../lib/searchRecorder';

export default function Card({ item, className = '' }: { item: Item; className?: string }) {
  const record = useSearchRecorder();
  const { open, play } = useItemActions();
  const isCurrent = usePlayer((s) => !!item.videoId && s.current?.videoId === item.videoId);
  const playing = usePlayer((s) => s.playing);
  const toggle = usePlayer((s) => s.toggle);
  const round = item.type === 'artist';
  const wide = item.wide || item.type === 'video';
  return (
    <div
      onClick={() => { record?.(item); isCurrent ? toggle() : open(item); }}
      className={`group shrink-0 snap-start cursor-pointer ${wide ? 'w-[240px] lg:w-[256px]' : 'w-[140px] lg:w-[144px]'} ${className}`}
    >
      <div className="relative">
        <Cover
          src={item.thumbnail}
          size={wide ? 480 : 300}
          alt={item.title}
          rounded={round ? 'rounded-full' : 'rounded-lg'}
          className={`w-full ${wide ? 'aspect-video' : 'aspect-square'}`}
        />
        {!round && (
          <button
            onClick={(e) => { e.stopPropagation(); isCurrent ? toggle() : play(item); }}
            aria-label="Putar"
            className={`absolute right-2 bottom-2 w-10 h-10 rounded-full bg-brand flex items-center justify-center shadow-xl transition-all
              ${isCurrent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0'}`}
          >
            {isCurrent && playing ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
          </button>
        )}
      </div>
      <p className={`mt-2 text-sm truncate ${round ? 'text-center' : ''} ${isCurrent ? 'text-spotify' : 'text-white'}`}>{item.title}</p>
      <p className={`text-xs text-zinc-400 truncate mt-0.5 ${round ? 'text-center' : ''}`}>{round ? 'Artis' : item.subtitle}</p>
    </div>
  );
}
