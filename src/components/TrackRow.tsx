import { Play, Pause } from 'lucide-react';
import type { Track, Item } from '../lib/types';
import Cover from './Cover';
import Eq from './Eq';
import LikeButton from './LikeButton';
import TrackMenu from './TrackMenu';
import { usePlayer } from '../store/player';
import { useItemActions } from '../lib/actions';
import { artistNames, fmtTime } from '../lib/format';
import { Link } from 'react-router-dom';
import { DlBadge } from './DownloadButton';
import { useUnavailable } from '../lib/offline';
import { toast } from '../lib/toast';
import { useSearchRecorder } from '../lib/searchRecorder';

export default function TrackRow({ track, index, context, showCover = true, onRemove }: {
  track: Track; index?: number; context?: Item[]; showCover?: boolean; onRemove?: () => void;
}) {
  const isCurrent = usePlayer((s) => s.current?.videoId === track.videoId);
  const playing = usePlayer((s) => s.playing);
  const toggle = usePlayer((s) => s.toggle);
  const { open } = useItemActions();
  const record = useSearchRecorder();
  // offline & belum diunduh → redup & tidak bisa diputar (seperti Spotify)
  const unavailable = useUnavailable(track.videoId) && !isCurrent;
  const click = () => {
    if (unavailable) return toast('Kamu sedang offline — lagu ini belum diunduh');
    record?.(track);
    return isCurrent ? toggle() : open(track, context);
  };
  return (
    <div
      onClick={click}
      aria-disabled={unavailable || undefined}
      title={unavailable ? 'Belum diunduh — tidak tersedia saat offline' : undefined}
      className={`group flex items-center gap-3 px-2 py-2 rounded-md select-none transition-opacity ${unavailable ? 'opacity-40 grayscale cursor-default' : 'hover:bg-white/[.07] cursor-pointer'}`}
    >
      {index != null && (
        <div className="w-6 text-center text-sm text-zinc-400 shrink-0 hidden sm:block">
          {isCurrent ? <Eq playing={playing} /> : <><span className="group-hover:hidden">{index + 1}</span><Play className="w-4 h-4 hidden group-hover:inline fill-white text-white" /></>}
        </div>
      )}
      {showCover && (
        <div className="relative w-12 h-12 shrink-0">
          <Cover src={track.thumbnail} size={120} className="w-12 h-12" rounded="rounded" />
          <div className={`absolute inset-0 rounded bg-black/50 items-center justify-center ${isCurrent ? 'flex' : unavailable ? 'hidden' : 'hidden group-hover:flex'}`}>
            {isCurrent && playing ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white" />}
          </div>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[15px] ${isCurrent ? 'text-spotify' : 'text-white'}`}>{track.title}</p>
        <p className="truncate text-[13px] text-zinc-400">
          <DlBadge videoId={track.videoId} />
          {track.explicit && <span className="inline-block mr-1.5 px-1 text-[9px] leading-[14px] font-bold rounded-sm bg-zinc-400 text-black align-[1px]">E</span>}
          {track.artists?.[0]?.id ? (
            <Link to={`/artist/${track.artists[0].id}`} onClick={(e) => e.stopPropagation()} className="hover:underline hover:text-white">
              {artistNames(track)}
            </Link>
          ) : (
            artistNames(track)
          )}
        </p>
      </div>
      {track.album?.name && (
        <Link
          to={track.album.id ? `/album/${track.album.id}` : '#'}
          onClick={(e) => e.stopPropagation()}
          className="hidden xl:block w-[28%] truncate text-sm text-zinc-400 hover:underline hover:text-white"
        >
          {track.album.name}
        </Link>
      )}
      <LikeButton track={track} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100" />
      {(track.duration || track.durationText) && (
        <span className="hidden sm:block w-12 text-right text-sm text-zinc-400 tabular-nums">{track.duration ? fmtTime(track.duration) : track.durationText}</span>
      )}
      <TrackMenu track={track} onRemove={onRemove} />
    </div>
  );
}
