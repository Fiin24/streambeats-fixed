import { ArrowRight, Play } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Section, Track } from '../lib/types';
import { isPlayable } from '../lib/types';
import Card from './Card';
import Cover from './Cover';
import ScrollRow from './ScrollRow';
import Eq from './Eq';
import { usePlayer } from '../store/player';
import { useItemActions } from '../lib/actions';

export function SectionHeader({ title, strapline, thumbnail, icon, action, onMore }: {
  title: string; strapline?: string; thumbnail?: string; icon?: ReactNode; action?: ReactNode; onMore?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 mb-3 lg:mb-4">
      {thumbnail && <Cover src={thumbnail} size={120} className="w-14 h-14 shrink-0" rounded="rounded-md" />}
      <div className="min-w-0 flex-1">
        {strapline && <p className="text-sm text-zinc-400 truncate">{strapline}</p>}
        <h2 className={`font-bold truncate flex items-center gap-2 ${strapline ? 'text-2xl' : 'text-xl'}`}>
          {icon}
          {title}
        </h2>
      </div>
      {action}
      {onMore && (
        <button onClick={onMore} aria-label="Lihat semua" className="p-2 rounded-full hover:bg-white/10">
          <ArrowRight className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}

/** Kisi daftar lagu 4 baris yang bergulir ke samping — seperti "Pilihan Cepat" */
export function QuickPicks({ items }: { items: Track[] }) {
  const { open } = useItemActions();
  const current = usePlayer((s) => s.current?.videoId);
  const playing = usePlayer((s) => s.playing);
  const toggle = usePlayer((s) => s.toggle);
  return (
    <div className="grid grid-rows-4 grid-flow-col auto-cols-[85%] sm:auto-cols-[300px] gap-x-4 gap-y-1 overflow-x-auto no-scrollbar snap-x">
      {items.map((t) => {
        const cur = current === t.videoId;
        return (
          <div
            key={t.videoId}
            onClick={() => (cur ? toggle() : open(t))}
            className="group flex items-center gap-3 p-1.5 rounded-md hover:bg-white/[.07] cursor-pointer snap-start min-w-0"
          >
            <div className="relative w-12 h-12 shrink-0">
              <Cover src={t.thumbnail} size={120} className="w-12 h-12" rounded="rounded" />
              <div className={`absolute inset-0 rounded bg-black/50 items-center justify-center ${cur ? 'flex' : 'hidden group-hover:flex'}`}>
                {cur ? <Eq playing={playing} /> : <Play className="w-5 h-5 fill-white" />}
              </div>
            </div>
            <div className="min-w-0">
              <p className={`text-[15px] truncate ${cur ? 'text-spotify' : ''}`}>{t.title}</p>
              <p className="text-[13px] text-zinc-400 truncate">{t.subtitle}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Shelf({ section }: { section: Section }) {
  const navigate = useNavigate();
  const playList = usePlayer((s) => s.playList);
  const playable = section.items.filter(isPlayable);
  const isList = section.layout === 'list' && playable.length >= 4;
  const more = section.browseId?.startsWith('UC') ? () => navigate(`/artist/${section.browseId}`) : undefined;
  return (
    <section className="mb-8">
      <SectionHeader
        title={section.title}
        strapline={section.strapline && section.strapline.length < 40 ? capital(section.strapline) : undefined}
        thumbnail={section.thumbnail}
        onMore={more}
        action={
          isList ? (
            <button onClick={() => playList(playable)} className="px-4 py-1.5 rounded-full border border-white/30 text-sm font-semibold hover:border-white hover:scale-105 transition">
              Putar semua
            </button>
          ) : undefined
        }
      />
      {isList ? (
        <QuickPicks items={playable} />
      ) : (
        <ScrollRow>
          {section.items.map((it) => (
            <Card key={it.id} item={it} />
          ))}
        </ScrollRow>
      )}
    </section>
  );
}
const capital = (s: string) => (s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s);
