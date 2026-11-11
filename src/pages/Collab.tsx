import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Play, Shuffle, Share2, Users, Loader2, Plus, Check, Trash2, LogOut, Search, ListMusic, LogIn } from 'lucide-react';
import Cover from '../components/Cover';
import { useAuth } from '../store/auth';
import { usePlayer } from '../store/player';
import { collab, collabLink, useCollabs, type CollabPlaylist } from '../lib/social';
import { search } from '../lib/api';
import { artistNames } from '../lib/format';
import { shareLink } from '../lib/share';
import { toast } from '../lib/toast';
import type { Track } from '../lib/types';

/** Playlist kolaboratif: /collab (daftar) & /collab/:id (detail — semua anggota bisa menambah lagu) */
export default function Collab() {
  const { id } = useParams();
  const token = useAuth((s) => s.token);
  const navigate = useNavigate();
  if (!token)
    return (
      <div className="px-6 py-20 text-center">
        <Users className="w-12 h-12 mx-auto text-zinc-500" />
        <p className="mt-4 text-lg font-bold">Playlist kolaboratif butuh akun</p>
        <p className="mt-1 text-sm text-zinc-400">Masuk agar kamu dan teman bisa menambah lagu ke playlist yang sama.</p>
        <button onClick={() => useAuth.getState().showAuth()} className="mt-5 inline-flex items-center gap-2 px-5 py-2 rounded-full bg-spotify text-white font-bold"><LogIn className="w-4 h-4" /> Masuk / Daftar</button>
      </div>
    );
  return id ? <Detail id={id} /> : <List onBack={() => navigate(-1)} />;
}

function List({ onBack }: { onBack: () => void }) {
  const c = useCollabs();
  useEffect(() => { void c.load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="px-4 lg:px-6 pb-10">
      <div className="flex items-center gap-2 h-14">
        <button onClick={onBack} aria-label="Kembali" className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10"><ArrowLeft className="w-6 h-6" /></button>
        <h1 className="text-xl font-bold">Playlist kolaboratif</h1>
      </div>
      {!c.loaded ? <Loader2 className="w-6 h-6 mx-auto mt-10 animate-spin" /> : c.list.length ? (
        <div className="space-y-1">
          {c.list.map((p) => (
            <Link key={p.id} to={`/collab/${p.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/[.06]">
              <Cover src={p.covers[0]} size={120} className="w-14 h-14 shrink-0" />
              <div className="min-w-0"><p className="font-semibold truncate">{p.name}</p><p className="text-sm text-zinc-400 truncate">oleh {p.ownerName} • {p.members} anggota • {p.count} lagu</p></div>
            </Link>
          ))}
        </div>
      ) : <p className="mt-10 text-center text-sm text-zinc-400">Belum ada. Buka salah satu playlist-mu lalu ketuk ikon <Users className="inline w-4 h-4" /> untuk menjadikannya kolaboratif.</p>}
    </div>
  );
}

function Detail({ id }: { id: string }) {
  const navigate = useNavigate();
  const [p, setP] = useState<CollabPlaylist | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const playList = usePlayer((s) => s.playList);

  useEffect(() => {
    let stop = false;
    const load = () => collab.get(id).then((x) => !stop && setP(x)).catch((e) => !stop && setErr(e.message));
    void load();
    const iv = setInterval(load, 15_000); // lihat lagu yang baru ditambahkan anggota lain
    return () => { stop = true; clearInterval(iv); };
  }, [id]);

  if (err && !p) return <p className="px-6 py-20 text-center text-zinc-400">{err}</p>;
  if (!p) return <Loader2 className="w-8 h-8 mx-auto mt-24 animate-spin" />;

  const run = async (f: () => Promise<void>) => { setBusy(true); try { await f(); } catch (e: any) { toast(e.message); } finally { setBusy(false); } };
  const join = () => run(async () => { setP(await collab.join(id)); void useCollabs.getState().load(); toast('Kamu sekarang anggota playlist ini'); });
  const leave = () => {
    if (!confirm(p.owner ? `Hapus playlist kolaboratif "${p.name}" untuk semua anggota?` : `Keluar dari "${p.name}"?`)) return;
    void run(async () => { await collab.leave(id); void useCollabs.getState().load(); navigate('/library'); });
  };
  const share = () => void shareLink({ url: collabLink(id), title: p.name, text: `Ayo isi playlist "${p.name}" bareng aku di Stream Beats!` });
  const remove = (t: Track) => run(async () => setP(await collab.remove(id, t.videoId)));

  return (
    <div className="pb-10" data-testid="collab-page">
      <div className="px-4 lg:px-6 pt-3 bg-gradient-to-b from-[#FA243C]/30 to-transparent">
        <button onClick={() => (history.length > 1 ? navigate(-1) : navigate('/library'))} aria-label="Kembali" className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10"><ArrowLeft className="w-6 h-6" /></button>
        <div className="mt-2 flex items-end gap-4">
          <div className="w-32 h-32 shrink-0 grid grid-cols-2 grid-rows-2 rounded-md overflow-hidden bg-surface">
            {p.covers.length ? Array.from({ length: 4 }, (_, i) => <Cover key={i} src={p.covers[i % p.covers.length]} size={120} className="w-full h-full" rounded="" />) : <ListMusic className="col-span-2 row-span-2 m-auto w-10 h-10 text-zinc-500" />}
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-spotify"><Users className="w-3.5 h-3.5" /> PLAYLIST KOLABORATIF</p>
            <h1 className="text-2xl font-black truncate">{p.name}</h1>
            <p className="text-sm text-zinc-300">oleh {p.ownerName} • {p.members} anggota • {p.count} lagu</p>
          </div>
        </div>
        <div className="mt-5 flex items-center gap-2">
          <button onClick={() => p.tracks.length && playList(p.tracks, 0)} disabled={!p.tracks.length} aria-label="Putar" className="w-12 h-12 rounded-full bg-spotify text-white flex items-center justify-center disabled:opacity-40"><Play className="w-6 h-6 fill-current" /></button>
          <button onClick={() => p.tracks.length && playList(p.tracks, 0, true)} disabled={!p.tracks.length} aria-label="Acak" className="p-2 text-zinc-300 hover:text-white disabled:opacity-40"><Shuffle className="w-6 h-6" /></button>
          {p.member ? (
            <>
              <button onClick={() => setAdding(!adding)} data-testid="collab-add-toggle" className="ml-auto h-9 px-4 rounded-full bg-white text-black text-sm font-bold flex items-center gap-1.5"><Plus className="w-4 h-4" /> Tambah lagu</button>
              <button onClick={share} aria-label="Undang teman" title="Undang teman" className="p-2 text-zinc-300 hover:text-white"><Share2 className="w-5 h-5" /></button>
              <button onClick={leave} disabled={busy} aria-label={p.owner ? 'Hapus playlist' : 'Keluar'} title={p.owner ? 'Hapus playlist' : 'Keluar'} className="p-2 text-zinc-300 hover:text-white">{p.owner ? <Trash2 className="w-5 h-5" /> : <LogOut className="w-5 h-5" />}</button>
            </>
          ) : (
            <button onClick={join} disabled={busy} data-testid="collab-join" className="ml-auto h-9 px-5 rounded-full bg-spotify text-white text-sm font-bold flex items-center gap-1.5">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />} Gabung playlist</button>
          )}
        </div>
      </div>

      {adding && <AddSongs existing={p.tracks} onAdd={async (t) => { const r = await collab.add(id, t); setP(r.playlist); toast(r.dup ? 'Lagu sudah ada' : `Ditambahkan: ${t.title}`); }} />}

      <div className="px-2 lg:px-4 mt-4">
        {!p.tracks.length && <p className="py-10 text-center text-zinc-500">Belum ada lagu. {p.member ? 'Ketuk "Tambah lagu" atau pakai menu ⋯ → Tambahkan ke playlist.' : 'Gabung untuk ikut menambah lagu.'}</p>}
        {p.tracks.map((t, i) => (
          <div key={t.videoId} className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-white/[.05]">
            <button onClick={() => playList(p.tracks, i)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
              <Cover src={t.thumbnail} size={96} className="w-11 h-11 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium truncate">{t.title}</p>
                <p className="text-xs text-zinc-500 truncate">{artistNames(t)} • ditambah {t.mine ? 'kamu' : t.by}</p>
              </div>
            </button>
            {(t.mine || p.owner) && <button onClick={() => void remove(t)} disabled={busy} aria-label="Hapus dari playlist" className="p-2 text-zinc-500 hover:text-white"><Trash2 className="w-4 h-4" /></button>}
          </div>
        ))}
      </div>
    </div>
  );
}

function AddSongs({ existing, onAdd }: { existing: Track[]; onAdd: (t: Track) => Promise<void> }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    const term = q.trim();
    if (!term) return setRes([]);
    setLoading(true);
    const tm = setTimeout(() => {
      search(term)
        .then((r) => setRes(r.sections.flatMap((s) => s.items).filter((x: any) => x.type === 'song' && x.videoId).slice(0, 12) as Track[]))
        .catch(() => setRes([]))
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(tm);
  }, [q]);
  const have = new Set(existing.map((t) => t.videoId));
  return (
    <div className="mx-4 lg:mx-6 mt-4 rounded-2xl bg-white/[.05] p-3">
      <div className="flex items-center gap-2 px-3 h-11 rounded-full bg-white/[.08]">
        <Search className="w-4 h-4 text-zinc-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Cari lagu untuk ditambahkan" data-testid="collab-search" className="flex-1 bg-transparent outline-none text-sm" />
        {loading && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />}
      </div>
      {res.map((t) => (
        <div key={t.videoId} className="flex items-center gap-3 px-1 py-2">
          <Cover src={t.thumbnail} size={96} className="w-10 h-10 shrink-0" />
          <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{t.title}</p><p className="text-xs text-zinc-500 truncate">{artistNames(t)}</p></div>
          <button
            disabled={have.has(t.videoId) || pending === t.videoId}
            onClick={async () => { setPending(t.videoId); try { await onAdd(t); } catch (e: any) { toast(e.message); } finally { setPending(null); } }}
            aria-label="Tambahkan" className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 disabled:opacity-60"
          >
            {pending === t.videoId ? <Loader2 className="w-4 h-4 animate-spin" /> : have.has(t.videoId) ? <Check className="w-4 h-4 text-spotify" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>
      ))}
    </div>
  );
}
