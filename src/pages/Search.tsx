import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, X } from 'lucide-react';
import { SearchRecorder, useSearchRecorder } from '../lib/searchRecorder';
import { TYPE_LABEL } from '../components/SearchBox';
import { search } from '../lib/api';
import type { Item, Section } from '../lib/types';
import { isPlayable } from '../lib/types';
import SearchBox from '../components/SearchBox';
import Card from '../components/Card';
import Cover from '../components/Cover';
import ScrollRow from '../components/ScrollRow';
import TrackRow from '../components/TrackRow';
import { SectionHeader } from '../components/Shelf';
import { useSettings } from '../store/settings';
import { useItemActions } from '../lib/actions';
import { Play, Users } from 'lucide-react';
import { authApi, type OtherUser } from '../lib/authApi';
import { useAuth } from '../store/auth';
import { UserCard, UserRow } from '../components/UserCards';

const FILTERS = [
  { id: '', label: 'Semua' },
  { id: 'songs', label: 'Lagu' },
  { id: 'videos', label: 'Video' },
  { id: 'albums', label: 'Album' },
  { id: 'artists', label: 'Artis' },
  { id: 'playlists', label: 'Playlist' },
  { id: 'users', label: 'Pengguna' },
];
/** kata kunci → bentuk username (huruf kecil, tanpa spasi/@) */
const toUsernameQuery = (q: string) => q.trim().toLowerCase().replace(/^@/, '').replace(/\s+/g, '').replace(/[^a-z0-9._]/g, '').slice(0, 20);
const GENRES: [string, string][] = [
  ['Pop Indonesia', '#e13300'], ['Dangdut', '#8d67ab'], ['K-Pop', '#e8115b'], ['Indie', '#148a08'], ['Hip-Hop', '#bc5900'],
  ['Rock', '#1e3264'], ['Jazz', '#477d95'], ['Lo-fi', '#503750'], ['Galau', '#7358ff'], ['Workout', '#d84000'],
  ['Akustik', '#056952'], ['Anime', '#dc148c'], ['Religi', '#27856a'], ['EDM', '#0d73ec'], ['R&B', '#ba5d07'], ['Koplo', '#a56752'],
];

function TopResult({ item }: { item: Item }) {
  const { open, play } = useItemActions();
  const record = useSearchRecorder();
  return (
    <div onClick={() => { record?.(item); open(item); }} className="group relative flex-1 p-5 rounded-lg bg-white/[.04] hover:bg-white/[.08] cursor-pointer transition">
      <Cover src={item.thumbnail} size={300} className="w-24 h-24 shadow-xl" rounded={item.type === 'artist' ? 'rounded-full' : 'rounded-md'} />
      <p className="text-3xl font-bold mt-5 truncate">{item.title}</p>
      <p className="text-sm text-zinc-400 mt-1 truncate">
        <span className="capitalize text-white">{({ song: 'Lagu', video: 'Video', artist: 'Artis', album: 'Album', playlist: 'Playlist' } as any)[item.type] || item.type}</span>
        {item.subtitle && ` • ${item.subtitle}`}
      </p>
      <button
        onClick={(e) => { e.stopPropagation(); record?.(item); play(item); }}
        aria-label="Putar"
        className="absolute right-5 bottom-5 w-12 h-12 rounded-full bg-brand flex items-center justify-center shadow-xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all"
      >
        <Play className="w-5 h-5 fill-white ml-0.5" />
      </button>
    </div>
  );
}

export default function Search() {
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') || '';
  const filter = sp.get('f') || '';
  const [sections, setSections] = useState<Section[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { recentSearches, recentItems, clearRecent, addRecent, addRecentItem, removeRecentItem } = useSettings();
  const [cat, setCat] = useState('all');
  const { open: openItem } = useItemActions();
  const navigate = useNavigate();
  const token = useAuth((s) => s.token);
  const [users, setUsers] = useState<OtherUser[] | null>(null);
  const [usersErr, setUsersErr] = useState<string | null>(null);
  const uq = toUsernameQuery(q);

  // cari pengguna lain (butuh akun) — berjalan bersamaan dengan pencarian musik
  useEffect(() => {
    setUsers(null); setUsersErr(null);
    if (!token || !uq || (filter && filter !== 'users')) return;
    let alive = true;
    const t = setTimeout(() => {
      authApi<{ users: OtherUser[] }>('users', { q: uq, limit: filter === 'users' ? 30 : 12 }, token)
        .then((r) => alive && setUsers(r.users))
        .catch((e) => alive && setUsersErr(e?.message || 'Gagal mencari pengguna'));
    }, 150);
    return () => { alive = false; clearTimeout(t); };
  }, [uq, filter, token]);

  useEffect(() => {
    if (filter === 'users') { setLoading(false); return setSections(null); }
    if (!q) return setSections(null);
    let alive = true;
    setLoading(true);
    setError(null);
    search(q, filter || undefined)
      .then((r) => alive && setSections(r.sections))
      .catch((e) => alive && setError(e?.message || 'Pencarian gagal'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [q, filter]);

  const go = (t: string) => { addRecent(t); navigate(`/search?q=${encodeURIComponent(t)}`); };
  const top = sections?.find((s) => /teratas|top result/i.test(s.title));
  const songs = sections?.find((s) => /^(lagu|songs)$/i.test(s.title));
  const rest = sections?.filter((s) => s !== top && (filter || s !== songs)) || [];

  return (
    <SearchRecorder.Provider value={addRecentItem}>
    <div className="px-4 lg:px-6 pb-8">
      <div className="lg:hidden pt-[max(env(safe-area-inset-top),16px)] pb-4 space-y-4">
        <h1 className="text-2xl font-bold">Mencari</h1>
        <SearchBox />
      </div>
      {q && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar py-2 lg:pt-4 mb-4">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setSp(f.id ? { q, f: f.id } : { q })}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm ${filter === f.id ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      {!q && (
        <div className="lg:pt-4">
          {(recentSearches.length > 0 || recentItems.length > 0) && (() => {
            const cats = [['all', 'Semua'], ...(['song', 'artist', 'album', 'playlist', 'video'] as const).filter((t) => recentItems.some((r) => r.type === t)).map((t) => [t, TYPE_LABEL[t]])];
            const items = recentItems.filter((r) => cat === 'all' || r.type === cat);
            return (
              <section className="mb-8" data-testid="search-history">
                <SectionHeader title="Riwayat pencarian" action={<button onClick={clearRecent} className="text-sm text-zinc-400 hover:text-white">Hapus semua</button>} />
                {cats.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3">
                    {cats.map(([k, l]) => (
                      <button key={k} onClick={() => setCat(k)} className={`shrink-0 px-3 py-1.5 rounded-full text-sm ${cat === k ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20'}`}>{l}</button>
                    ))}
                  </div>
                )}
                {cat === 'all' && recentSearches.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {recentSearches.map((r) => (
                      <button key={r} onClick={() => go(r)} className="px-3.5 py-1.5 rounded-full border border-white/15 hover:border-white/40 text-sm text-zinc-200">{r}</button>
                    ))}
                  </div>
                )}
                <div className="max-w-2xl">
                  {items.slice(0, cat === 'all' ? 8 : 30).map((r) => (
                    <div key={r.id} className="group flex items-center gap-3 px-2 py-1.5 -mx-2 rounded-md hover:bg-white/[.06]">
                      <button onClick={() => { addRecentItem(r as Item); openItem(r as Item); }} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                        <Cover src={r.thumbnail} size={96} className="w-12 h-12 shrink-0" rounded={r.type === 'artist' ? 'rounded-full' : 'rounded'} />
                        <span className="min-w-0">
                          <span className="block truncate">{r.title}</span>
                          <span className="block truncate text-sm text-zinc-400">{TYPE_LABEL[r.type] || r.type}{r.subtitle && ` · ${r.subtitle}`}</span>
                        </span>
                      </button>
                      <button onClick={() => removeRecentItem(r.id)} aria-label={`Hapus ${r.title} dari riwayat`} className="p-2 text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </section>
            );
          })()}
          <button onClick={() => navigate('/charts')} data-testid="search-charts-card" className="mb-8 w-full flex items-center gap-4 p-4 rounded-xl text-left bg-white/[.05] border border-white/[.07] hover:bg-white/[.08] transition">
            <span className="w-14 h-14 shrink-0 rounded-lg bg-brand flex items-center justify-center text-2xl font-black tracking-tighter">#1</span>
            <span className="flex-1 min-w-0">
              <span className="block text-lg font-bold">Tangga lagu</span>
              <span className="block text-sm text-zinc-400">Teratas di Indonesia, global, dan negara lain</span>
            </span>
          </button>
          <SectionHeader title="Jelajahi semua" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {GENRES.map(([g, c]) => (
              <button key={g} onClick={() => go(g)} style={{ ['--c' as any]: c }} className="group relative h-24 rounded-lg overflow-hidden px-4 py-3 text-left bg-[color-mix(in_srgb,var(--c)_70%,#111)] hover:bg-[var(--c)] transition-colors">
                <span className="font-bold text-lg leading-tight">{g}</span>
                <span className="absolute left-4 right-4 bottom-3 h-[3px] rounded-full bg-black/25"><span className="block h-full w-1/3 rounded-full bg-white/70 group-hover:w-full transition-all duration-500" /></span>
              </button>
            ))}
          </div>
        </div>
      )}
      {q && filter === 'users' && (
        !token ? (
          <div className="flex flex-col items-center text-center gap-3 py-16">
            <Users className="w-10 h-10 text-zinc-500" />
            <p className="text-zinc-300">Masuk ke akun untuk mencari pengguna lain.</p>
            <button onClick={() => useAuth.getState().showAuth()} className="px-5 py-2 rounded-full bg-spotify text-white text-sm font-bold">Masuk / Daftar</button>
          </div>
        ) : !uq ? (
          <p className="text-center text-zinc-400 py-16">Username hanya berisi huruf, angka, titik, dan garis bawah.</p>
        ) : usersErr ? (
          <p className="text-center text-zinc-400 py-16">{usersErr}</p>
        ) : !users ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-zinc-500" /></div>
        ) : users.length === 0 ? (
          <p className="text-center text-zinc-400 py-16">Tidak ada pengguna dengan username “{uq}”</p>
        ) : (
          <section className="max-w-2xl">
            <SectionHeader title="Pengguna" />
            {users.map((u) => <UserRow key={u.username} u={u} />)}
          </section>
        )
      )}
      {q && !filter && users && users.length > 0 && !loading && (
        <section className="mb-8">
          <SectionHeader title="Pengguna" action={<button onClick={() => setSp({ q, f: 'users' })} className="text-sm font-bold text-zinc-400 hover:text-white">Tampilkan semua</button>} />
          <ScrollRow>{users.map((u) => <UserCard key={u.username} u={u} />)}</ScrollRow>
        </section>
      )}
      {q && loading && <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-zinc-500" /></div>}
      {q && error && <p className="text-center text-zinc-400 py-20">{error}</p>}
      {q && filter !== 'users' && !loading && !error && sections && (
        sections.length === 0 ? (
          <p className="text-center text-zinc-400 py-20">Tidak ada hasil untuk “{q}”</p>
        ) : (
          <>
            {!filter && (top || songs) && (
              <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-6 mb-8">
                {top?.items[0] && (
                  <section className="flex flex-col">
                    <SectionHeader title="Hasil teratas" />
                    <TopResult item={top.items[0]} />
                  </section>
                )}
                {songs && (
                  <section className="min-w-0">
                    <SectionHeader title="Lagu" />
                    {songs.items.filter(isPlayable).slice(0, 4).map((t) => (
                      <TrackRow key={t.videoId} track={t} context={songs.items} />
                    ))}
                  </section>
                )}
              </div>
            )}
            {rest.map((s, i) => {
              const playable = s.items.filter(isPlayable);
              const asRows = filter === 'songs' || filter === 'videos' || (s.items.every((x) => x.type === 'song') && playable.length);
              return (
                <section key={`${s.title}-${i}`} className="mb-8">
                  <SectionHeader title={s.title} />
                  {asRows ? (
                    playable.map((t, k) => <TrackRow key={`${t.videoId}-${k}`} track={t} index={filter ? k : undefined} context={playable} />)
                  ) : filter ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">
                      {s.items.map((it) => <Card key={it.id} item={it} className="!w-full" />)}
                    </div>
                  ) : (
                    <ScrollRow>{s.items.map((it) => <Card key={it.id} item={it} />)}</ScrollRow>
                  )}
                </section>
              );
            })}
          </>
        )
      )}
    </div>
    </SearchRecorder.Provider>
  );
}
