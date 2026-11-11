import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MoreHorizontal, PanelRightClose, BadgeCheck } from 'lucide-react';
import { usePlayer } from '../store/player';
import { browse } from '../lib/api';
import type { BrowsePage } from '../lib/types';
import Cover from './Cover';
import LyricsView from './LyricsView';
import QueueView from './QueueView';
import TrackMenu from './TrackMenu';
import { artistNames } from '../lib/format';

function ArtistCard({ id, name }: { id?: string; name: string }) {
  const [a, setA] = useState<BrowsePage | null>(null);
  useEffect(() => {
    setA(null);
    if (id) browse(id).then(setA).catch(() => {});
  }, [id]);
  return (
    <Link to={id ? `/artist/${id}` : '#'} className="block rounded-lg overflow-hidden bg-ink-850 hover:brightness-110 transition">
      <div className="relative h-56">
        <Cover src={a?.thumbnail} size={700} rounded="" className="absolute inset-0 w-full h-full" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/80" />
        <p className="absolute left-4 top-3 text-sm font-bold">Tentang artis</p>
        <p className="absolute left-4 bottom-3 text-xl font-bold flex items-center gap-1.5">
          {a?.title || name} <BadgeCheck className="w-5 h-5 text-white fill-[#3080FF]" />
        </p>
      </div>
      {(a?.subtitle || a?.description) && (
        <div className="p-4 space-y-2">
          {a?.subtitle && <p className="text-sm text-zinc-300">{a.subtitle} pelanggan</p>}
          {a?.description && <p className="text-sm text-zinc-400 line-clamp-2">{a.description}</p>}
        </div>
      )}
    </Link>
  );
}

export default function RightPanel() {
  const { current, rightPanel, setRightPanel, queue, index, jumpTo } = usePlayer();
  if (!rightPanel) return null;
  const nextUp = queue[index + 1];
  const title = rightPanel === 'queue' ? 'Antrean' : rightPanel === 'lyrics' ? 'Lirik' : current?.title;
  return (
    <aside className="hidden lg:flex flex-col w-[clamp(280px,26.4vw,380px)] shrink-0 rounded-lg bg-panel overflow-hidden">
      {!current && rightPanel === 'nowplaying' ? (
        <div className="flex-1 flex items-center justify-center px-4 text-center text-zinc-400">Putar lagu untuk melihat detailnya di sini</div>
      ) : (
        <>
          <div className="flex items-center gap-2 px-4 h-16 shrink-0 border-b border-white/5">
            <p className="font-bold truncate flex-1">{title}</p>
            {current && rightPanel === 'nowplaying' && <TrackMenu track={current} />}
            <button onClick={() => setRightPanel(rightPanel)} aria-label="Tutup panel" className="p-1.5 rounded-md bg-surface text-zinc-300 hover:text-white">
              <PanelRightClose className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-[var(--dock)]">
            {rightPanel === 'lyrics' && <div className="h-full"><LyricsView /></div>}
            {rightPanel === 'queue' && <div className="pt-4"><QueueView /></div>}
            {rightPanel === 'nowplaying' && current && (
              <div className="space-y-6 pt-0">
                <Cover src={current.thumbnail} size={800} alt={current.title} rounded="rounded-lg" className="w-full aspect-square" />
                <div>
                  <h2 className="text-[26px] font-bold leading-tight">{current.title}</h2>
                  <p className="text-zinc-400 mt-1 truncate">
                    {current.artists?.[0]?.id ? <Link to={`/artist/${current.artists[0].id}`} className="hover:underline hover:text-white">{artistNames(current)}</Link> : artistNames(current)}
                  </p>
                </div>
                <ArtistCard id={current.artists?.[0]?.id} name={current.artists?.[0]?.name || current.subtitle} />
                <div className="rounded-lg bg-ink-850 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-bold">Kredit</p>
                  </div>
                  {(current.artists?.length ? current.artists : [{ name: current.subtitle }]).map((a, i) => (
                    <div key={i} className="py-1.5">
                      <p className="text-sm">{a.name}</p>
                      <p className="text-xs text-zinc-400">Artis Utama</p>
                    </div>
                  ))}
                  {current.album?.name && (
                    <div className="py-1.5">
                      <p className="text-sm">{current.album.name}</p>
                      <p className="text-xs text-zinc-400">Album</p>
                    </div>
                  )}
                </div>
                {nextUp && (
                  <div className="rounded-lg bg-ink-850 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-bold">Berikutnya dalam antrean</p>
                      <button onClick={() => setRightPanel('queue')} className="text-sm text-zinc-400 hover:text-white hover:underline">Buka antrean</button>
                    </div>
                    <button onClick={() => jumpTo(index + 1)} className="w-full flex items-center gap-3 p-1 rounded-md hover:bg-white/[.07] text-left">
                      <Cover src={nextUp.thumbnail} size={120} className="w-12 h-12 shrink-0" rounded="rounded" />
                      <div className="min-w-0">
                        <p className="truncate">{nextUp.title}</p>
                        <p className="text-sm text-zinc-400 truncate">{artistNames(nextUp)}</p>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
