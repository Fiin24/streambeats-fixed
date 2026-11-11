import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Play, Radio, Shuffle, Loader2, BadgeCheck } from 'lucide-react';
import { useFollows, useIsFollowing } from '../store/follows';
import { browse, getNext } from '../lib/api';
import type { BrowsePage } from '../lib/types';
import { isPlayable } from '../lib/types';
import Cover from '../components/Cover';
import TrackRow from '../components/TrackRow';
import Shelf from '../components/Shelf';
import { usePlayer } from '../store/player';
import { toast } from '../lib/toast';

export default function Artist() {
  const { id = '' } = useParams();
  const [a, setA] = useState<BrowsePage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const playList = usePlayer((s) => s.playList);
  const following = useIsFollowing(id);

  useEffect(() => {
    setA(null); setErr(null); setAll(false);
    browse(id).then(setA).catch((e) => setErr(e?.message || 'Gagal memuat artis'));
    document.getElementById('main-scroll')?.scrollTo(0, 0);
  }, [id]);

  const start = async (pid?: string, shuffle = false) => {
    const tracks = a?.tracks.filter(isPlayable) || [];
    setBusy(true);
    try {
      if (pid) {
        const n = await getNext(undefined, pid);
        const t = n.tracks.filter(isPlayable);
        if (t.length) return playList(t, 0, shuffle);
      }
      if (tracks.length) playList(tracks, 0, shuffle);
      else toast('Tidak ada lagu yang bisa diputar');
    } catch {
      if (tracks.length) playList(tracks, 0, shuffle);
    } finally {
      setBusy(false);
    }
  };

  if (err) return <p className="text-center text-zinc-400 py-24">{err}</p>;
  if (!a) return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-zinc-500" /></div>;
  const tracks = a.tracks.filter(isPlayable);
  return (
    <div className="pb-8">
      <div className="relative h-[300px] lg:h-[360px] -mb-2">
        <Cover src={a.thumbnail} size={1400} rounded="" className="absolute inset-0 w-full h-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] lg:from-panel via-black/30 to-black/10" />
        <div className="absolute left-4 lg:left-6 right-4 bottom-6">
          <p className="flex items-center gap-1.5 text-sm"><BadgeCheck className="w-5 h-5 fill-electric text-white" /> Artis Terverifikasi</p>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight mt-2 line-clamp-2">{a.title}</h1>
          {a.subtitle && <p className="text-zinc-300 mt-3">{a.subtitle}</p>}
        </div>
      </div>
      <div className="px-4 lg:px-6">
        <div className="flex items-center gap-4 py-6">
          <button onClick={() => start(a.playlistId)} disabled={busy} aria-label="Putar" className="w-14 h-14 rounded-full bg-brand flex items-center justify-center hover:scale-105 transition shadow-xl">
            {busy ? <Loader2 className="w-6 h-6 animate-spin" /> : <Play className="w-6 h-6 fill-white ml-0.5" />}
          </button>
          <button onClick={() => start(a.playlistId, true)} aria-label="Acak" className="p-2 text-zinc-300 hover:text-white"><Shuffle className="w-7 h-7" /></button>
          <button
            onClick={() => {
              const on = useFollows.getState().toggle({ id, name: a.title, thumbnail: a.thumbnail || '' });
              toast(on ? `Mengikuti ${a.title}` : `Berhenti mengikuti ${a.title}`);
            }}
            aria-pressed={following}
            className={`px-4 py-1.5 rounded-full border text-sm font-bold transition hover:scale-105 ${following ? 'border-white text-white' : 'border-white/40 text-zinc-200 hover:border-white'}`}
          >
            {following ? 'Mengikuti' : 'Ikuti'}
          </button>
          {a.radioPlaylistId && (
            <button onClick={() => start(a.radioPlaylistId)} className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/30 text-sm font-semibold hover:border-white">
              <Radio className="w-4 h-4" /> Radio
            </button>
          )}
        </div>
        {tracks.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-bold mb-3">Populer</h2>
            {(all ? tracks : tracks.slice(0, 5)).map((t, i) => <TrackRow key={t.videoId} track={t} index={i} context={tracks} />)}
            {tracks.length > 5 && (
              <button onClick={() => setAll(!all)} className="mt-2 px-2 text-sm font-semibold text-zinc-400 hover:text-white">{all ? 'Lebih sedikit' : 'Lihat lainnya'}</button>
            )}
          </section>
        )}
        {a.sections.map((s, i) => <Shelf key={`${s.title}-${i}`} section={s} />)}
        {a.description && (
          <section className="mb-8">
            <h2 className="text-xl font-bold mb-3">Tentang</h2>
            <p className="text-zinc-400 whitespace-pre-line max-w-3xl line-clamp-[8]">{a.description}</p>
          </section>
        )}
      </div>
    </div>
  );
}
