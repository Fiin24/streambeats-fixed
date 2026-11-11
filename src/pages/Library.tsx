import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Plus, ListMusic, Clock, CircleArrowDown, Import, Settings, Users } from 'lucide-react';
import { useTogether } from '../store/together';
import { usePlayer } from '../store/player';
import Cover from '../components/Cover';
import TrackRow from '../components/TrackRow';
import CreatePlaylistModal from '../components/CreatePlaylistModal';
import SpotifyImportModal from '../components/SpotifyImportModal';
import { useDownloads } from '../store/downloads';
import { useFollows } from '../store/follows';
import { img } from '../lib/img';
import { Mic2 } from 'lucide-react';
import { useCollabs } from '../lib/social';
import { useAuth } from '../store/auth';

type Tab = 'liked' | 'playlists' | 'artists' | 'history';

export default function Library() {
  const { liked, playlists, history } = usePlayer();
  const [tab, setTab] = useState<Tab>('playlists');
  const [create, setCreate] = useState(false);
  const [importing, setImporting] = useState(false);
  const dlCount = useDownloads((s) => Object.keys(s.items).length);
  const follows = useFollows((s) => s.artists);
  const together = useTogether((s) => s.status === 'connected' || s.status === 'pending');
  const token = useAuth((s) => s.token);
  const collabs = useCollabs();
  useEffect(() => { if (token) void collabs.load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="px-4 lg:px-6 pb-8">
      <div className="flex items-center justify-between pt-[max(env(safe-area-inset-top),16px)] lg:pt-6 pb-4">
        <h1 className="text-2xl lg:text-3xl font-bold">Pustaka</h1>
        <div className="flex items-center gap-1">
          <button onClick={() => setImporting(true)} aria-label="Impor dari Spotify" title="Impor dari Spotify" className="p-2 rounded-full hover:bg-white/10"><Import className="w-6 h-6" /></button>
          <button onClick={() => setCreate(true)} aria-label="Buat playlist" className="p-2 rounded-full hover:bg-white/10"><Plus className="w-6 h-6" /></button>
          <Link to="/together" aria-label="Dengar bersama" title="Dengar bersama" className="relative p-2 rounded-full hover:bg-white/10">
            <Users className="w-6 h-6" />
            {together && <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-green-500 ring-2 ring-[#0a0a0a]" />}
          </Link>
          <Link to="/settings" aria-label="Pengaturan" className="p-2 rounded-full hover:bg-white/10"><Settings className="w-6 h-6" /></Link>
        </div>
      </div>
      <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar">
        {([['playlists', 'Playlist'], ['liked', 'Disukai'], ['artists', 'Artis'], ['history', 'Riwayat']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`shrink-0 px-4 py-1.5 rounded-full text-sm ${tab === k ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20'}`}>{l}</button>
        ))}
      </div>

      {tab === 'playlists' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">
          <Link to="/liked" className="group p-3 rounded-lg bg-white/[.03] hover:bg-white/[.07] transition">
            <div className="aspect-square rounded-md bg-gradient-to-br from-[#450af5] to-[#c4efd9] flex items-center justify-center">
              <Heart className="w-10 h-10 fill-white" />
            </div>
            <p className="mt-2 font-semibold truncate">Lagu Disukai</p>
            <p className="text-sm text-zinc-400">{liked.length} lagu</p>
          </Link>
          <Link to="/downloads" className="group p-3 rounded-lg bg-white/[.03] hover:bg-white/[.07] transition">
            <div className="aspect-square rounded-md bg-gradient-to-br from-[#1DB954] to-[#0b3d20] flex items-center justify-center">
              <CircleArrowDown className="w-10 h-10" />
            </div>
            <p className="mt-2 font-semibold truncate">Lagu Diunduh</p>
            <p className="text-sm text-zinc-400">{dlCount} lagu • offline</p>
          </Link>
          {token && collabs.list.map((c) => (
            <Link key={c.id} to={`/collab/${c.id}`} data-testid="library-collab-item" className="p-3 rounded-lg bg-white/[.03] hover:bg-white/[.07] transition">
              <div className="relative">
                {c.covers[0] ? <Cover src={c.covers[0]} size={300} className="w-full aspect-square" /> : (
                  <div className="aspect-square rounded-md bg-surface flex items-center justify-center"><ListMusic className="w-10 h-10 text-zinc-500" /></div>
                )}
                <span className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-spotify text-white flex items-center justify-center"><Users className="w-4 h-4" /></span>
              </div>
              <p className="mt-2 font-semibold truncate">{c.name}</p>
              <p className="text-sm text-zinc-400 truncate">Kolaboratif • {c.count} lagu</p>
            </Link>
          ))}
          {playlists.map((p) => (
            <Link key={p.id} to={`/my/${p.id}`} className="p-3 rounded-lg bg-white/[.03] hover:bg-white/[.07] transition">
              {p.tracks[0] ? <Cover src={p.tracks[0].thumbnail} size={300} className="w-full aspect-square" /> : (
                <div className="aspect-square rounded-md bg-surface flex items-center justify-center"><ListMusic className="w-10 h-10 text-zinc-500" /></div>
              )}
              <p className="mt-2 font-semibold truncate">{p.name}</p>
              <p className="text-sm text-zinc-400">{p.tracks.length} lagu</p>
            </Link>
          ))}
          <button onClick={() => setCreate(true)} className="p-3 rounded-lg border border-dashed border-white/15 hover:border-white/40 transition text-left">
            <div className="aspect-square rounded-md flex items-center justify-center"><Plus className="w-10 h-10 text-zinc-500" /></div>
            <p className="mt-2 font-semibold">Buat playlist</p>
            <p className="text-sm text-zinc-400">Tersimpan di perangkat</p>
          </button>
          <button onClick={() => setImporting(true)} className="p-3 rounded-lg border border-dashed border-[#FA243C]/40 hover:border-[#FA243C] transition text-left">
            <div className="aspect-square rounded-md flex items-center justify-center"><Import className="w-10 h-10 text-[#FA243C]" /></div>
            <p className="mt-2 font-semibold">Impor dari Spotify</p>
            <p className="text-sm text-zinc-400">Tempel link playlist</p>
          </button>
        </div>
      )}
      {tab === 'liked' && (liked.length ? liked.map((t, i) => <TrackRow key={t.videoId} track={t} index={i} context={liked} />) : (
        <Empty icon={<Heart className="w-10 h-10" />} text="Lagu yang kamu sukai akan muncul di sini" />
      ))}
      {tab === 'artists' && (follows.length ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-7 gap-4">
          {follows.map((a) => (
            <Link key={a.id} to={`/artist/${a.id}`} className="p-2 rounded-lg hover:bg-white/[.06]">
              <img src={img(a.thumbnail, 240)} alt="" referrerPolicy="no-referrer" className="w-full aspect-square rounded-full object-cover bg-zinc-800" />
              <p className="mt-2 font-semibold truncate text-center">{a.name}</p>
              <p className="text-xs text-zinc-400 text-center">Artis</p>
            </Link>
          ))}
        </div>
      ) : (
        <Empty icon={<Mic2 className="w-10 h-10" />} text="Artis yang kamu ikuti akan muncul di sini" />
      ))}
      {tab === 'history' && (history.length ? history.map((t, i) => <TrackRow key={t.videoId} track={t} index={i} context={history} />) : (
        <Empty icon={<Clock className="w-10 h-10" />} text="Belum ada riwayat pemutaran" />
      ))}
      <CreatePlaylistModal open={create} onClose={() => setCreate(false)} />
      <SpotifyImportModal open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="flex flex-col items-center text-zinc-500 gap-3 py-20">{icon}<p>{text}</p></div>;
}
