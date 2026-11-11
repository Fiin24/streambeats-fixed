import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Library, Plus, Heart, ListMusic, Clock, CircleArrowDown, Import } from 'lucide-react';
import { usePlayer } from '../store/player';
import Cover from './Cover';
import Eq from './Eq';
import CreatePlaylistModal from './CreatePlaylistModal';
import SpotifyImportModal from './SpotifyImportModal';
import { useDownloads } from '../store/downloads';
import { artistNames } from '../lib/format';

export default function LeftSidebar() {
  const { liked, playlists, history, current, playing, playTrack, toggle } = usePlayer();
  const [create, setCreate] = useState(false);
  const [importing, setImporting] = useState(false);
  const dlCount = useDownloads((s) => Object.keys(s.items).length);
  const [tab, setTab] = useState<'all' | 'playlist' | 'history'>('all');
  const navigate = useNavigate();
  const empty = !liked.length && !playlists.length && !history.length;
  return (
    <aside className="hidden lg:flex flex-col w-[clamp(280px,26.4vw,380px)] shrink-0 rounded-lg bg-panel overflow-hidden">
      <div className="flex items-center justify-between px-6 pt-4 pb-3">
        <button onClick={() => navigate('/library')} className="flex items-center gap-3 text-zinc-400 hover:text-white font-bold transition">
          <Library className="w-6 h-6" /> Your Library
        </button>
        <div className="flex items-center">
          <button onClick={() => setImporting(true)} aria-label="Impor dari Spotify" title="Impor playlist dari Spotify" className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10">
            <Import className="w-5 h-5" />
          </button>
          <button onClick={() => setCreate(true)} aria-label="Buat playlist" className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10">
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>
      {!empty && (
        <div className="flex gap-2 px-4 pb-2">
          {([['all', 'Semua'], ['playlist', 'Playlist'], ['history', 'Riwayat']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-full text-sm ${tab === k ? 'bg-white text-black' : 'bg-surface hover:bg-[#333]'}`}>
              {l}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-2 pb-[var(--dock)]">
        {empty && <p className="text-center text-sm text-zinc-500 mt-6 px-6">Belum ada riwayat pemutaran</p>}
        {tab !== 'history' && liked.length > 0 && (
          <Link to="/liked" className="flex items-center gap-3 p-2 rounded-md hover:bg-white/[.07]">
            <div className="w-12 h-12 rounded bg-gradient-to-br from-[#450af5] to-[#c4efd9] flex items-center justify-center">
              <Heart className="w-5 h-5 fill-white" />
            </div>
            <div className="min-w-0">
              <p className="truncate">Lagu Disukai</p>
              <p className="text-sm text-zinc-400">Playlist • {liked.length} lagu</p>
            </div>
          </Link>
        )}
        {tab !== 'history' && dlCount > 0 && (
          <Link to="/downloads" className="flex items-center gap-3 p-2 rounded-md hover:bg-white/[.07]">
            <div className="w-12 h-12 rounded bg-gradient-to-br from-[#FA243C] to-[#0b3d20] flex items-center justify-center">
              <CircleArrowDown className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate">Lagu Diunduh</p>
              <p className="text-sm text-zinc-400">Offline • {dlCount} lagu</p>
            </div>
          </Link>
        )}
        {tab !== 'history' &&
          playlists.map((p) => (
            <Link key={p.id} to={`/my/${p.id}`} className="flex items-center gap-3 p-2 rounded-md hover:bg-white/[.07]">
              {p.tracks[0] ? (
                <Cover src={p.tracks[0].thumbnail} size={120} className="w-12 h-12" rounded="rounded" />
              ) : (
                <div className="w-12 h-12 rounded bg-surface flex items-center justify-center"><ListMusic className="w-5 h-5 text-zinc-400" /></div>
              )}
              <div className="min-w-0">
                <p className="truncate">{p.name}</p>
                <p className="text-sm text-zinc-400">Playlist • {p.tracks.length} lagu</p>
              </div>
            </Link>
          ))}
        {tab !== 'playlist' && history.length > 0 && (
          <>
            <p className="flex items-center gap-2 px-2 pt-4 pb-1 text-xs uppercase tracking-wider text-zinc-500"><Clock className="w-3.5 h-3.5" /> Baru diputar</p>
            {history.slice(0, 40).map((t) => {
              const cur = current?.videoId === t.videoId;
              return (
                <button key={t.videoId} onClick={() => (cur ? toggle() : playTrack(t))} className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-white/[.07] text-left">
                  <Cover src={t.thumbnail} size={120} className="w-12 h-12 shrink-0" rounded="rounded" />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate ${cur ? 'text-spotify' : ''}`}>{t.title}</p>
                    <p className="text-sm text-zinc-400 truncate">{artistNames(t)}</p>
                  </div>
                  {cur && <Eq playing={playing} className="mr-2" />}
                </button>
              );
            })}
          </>
        )}
      </div>
      <CreatePlaylistModal open={create} onClose={() => setCreate(false)} />
      <SpotifyImportModal open={importing} onClose={() => setImporting(false)} />
    </aside>
  );
}
