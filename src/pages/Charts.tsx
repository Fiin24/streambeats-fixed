import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Play, Shuffle } from 'lucide-react';
import { getCharts, browse } from '../lib/api';
import type { BrowsePage, Item, Track } from '../lib/types';
import { isPlayable } from '../lib/types';
import TrackRow from '../components/TrackRow';
import Card from '../components/Card';
import { usePlayer } from '../store/player';

const COUNTRIES: [string, string][] = [['ID', 'Indonesia'], ['ZZ', 'Global'], ['MY', 'Malaysia'], ['US', 'Amerika'], ['KR', 'Korea'], ['JP', 'Jepang'], ['IN', 'India']];

/** Tangga lagu YouTube Music per negara: daftar lagu teratas + artis teratas */
export default function Charts() {
  const navigate = useNavigate();
  const [country, setCountry] = useState(() => localStorage.getItem('sb-chart-cc') || 'ID');
  const [data, setData] = useState<BrowsePage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pl, setPl] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const playList = usePlayer((s) => s.playList);

  useEffect(() => {
    localStorage.setItem('sb-chart-cc', country);
    setData(null); setErr(null); setTracks(null); setPl(null);
    getCharts(country)
      .then((d) => { setData(d); const first = d.sections.flatMap((s) => s.items).find((i) => i.type === 'playlist'); setPl(first?.id || null); })
      .catch((e) => setErr(e.message || 'Gagal memuat tangga lagu'));
  }, [country]);

  useEffect(() => {
    if (!pl) return;
    setTracks(null);
    browse(pl).then((d) => setTracks(d.tracks.filter(isPlayable) as Track[])).catch(() => setTracks([]));
  }, [pl]);

  const charts = data?.sections.flatMap((s) => s.items).filter((i) => i.type === 'playlist') || [];
  const artists = (data?.tracks || []).filter((i: Item) => i.type === 'artist');

  return (
    <div className="pb-10" data-testid="charts-page">
      <div className="sticky top-0 z-10 flex items-center gap-2 px-2 h-14 bg-[#121212]/95 backdrop-blur">
        <button onClick={() => navigate(-1)} aria-label="Kembali" className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10"><ArrowLeft className="w-6 h-6" /></button>
        <h1 className="text-xl font-bold">Tangga lagu</h1>
      </div>
      <div className="px-4 lg:px-6">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {COUNTRIES.map(([cc, label]) => (
            <button key={cc} onClick={() => setCountry(cc)} data-testid={`charts-cc-${cc}`}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold ${country === cc ? 'bg-spotify text-white' : 'bg-white/[.08] hover:bg-white/[.12]'}`}>{label}</button>
          ))}
        </div>

        {err && <p className="py-16 text-center text-zinc-400">{err}</p>}
        {!data && !err && <Loader2 className="w-8 h-8 mx-auto mt-16 animate-spin" />}

        {charts.length > 0 && (
          <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar">
            {charts.map((c) => (
              <button key={c.id} onClick={() => setPl(c.id)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-[13px] font-medium border ${pl === c.id ? 'border-white bg-white/10' : 'border-white/15 text-zinc-300 hover:border-white/40'}`}>{c.title}</button>
            ))}
          </div>
        )}

        {pl && (
          <section className="mt-5">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="flex-1 text-xl font-bold truncate">{charts.find((c) => c.id === pl)?.title || 'Lagu teratas'}</h2>
              <button onClick={() => tracks?.length && playList(tracks, 0, true)} disabled={!tracks?.length} aria-label="Acak" className="p-2 text-zinc-300 hover:text-white disabled:opacity-40"><Shuffle className="w-5 h-5" /></button>
              <button onClick={() => tracks?.length && playList(tracks, 0)} disabled={!tracks?.length} data-testid="charts-play" aria-label="Putar semua" className="w-11 h-11 rounded-full bg-spotify text-white flex items-center justify-center disabled:opacity-40"><Play className="w-5 h-5 fill-current" /></button>
            </div>
            {!tracks ? <Loader2 className="w-6 h-6 mx-auto my-10 animate-spin" /> : tracks.length ? (
              <div className="-mx-2">{tracks.slice(0, 50).map((t, i) => <TrackRow key={`${t.videoId}-${i}`} track={t} index={i} context={tracks} />)}</div>
            ) : <p className="py-8 text-center text-zinc-500">Daftar lagu tidak tersedia.</p>}
          </section>
        )}

        {artists.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xl font-bold mb-3">Artis teratas</h2>
            <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-1 px-1">
              {artists.slice(0, 20).map((a) => <Card key={a.id} item={a} className="w-36 shrink-0" />)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
