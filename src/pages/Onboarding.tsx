import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, Loader2, Search, X } from 'lucide-react';
import { browse, search } from '../lib/api';
import { img } from '../lib/img';
import { GENRES, genreById, type Genre } from '../lib/genres';
import { useTaste, type PickedArtist } from '../store/taste';
import { useAuth } from '../store/auth';
import type { Item } from '../lib/types';

const MIN_ARTISTS = 3;
const JUNK = /\b(beats?|instrumentals?|music|musik|mix|hits|lounge|relax(ing)?|playlists?|radio|compilation|songs|vibes|karaoke|cover|channel|official audio)\b/i;

const toArtist = (i: Item): PickedArtist | null => {
  const id = i.browseId || i.id;
  return i.type === 'artist' && id && i.title ? { id, name: i.title, thumbnail: i.thumbnail } : null;
};
const artistsOf = (items: Item[]) => items.map(toArtist).filter((a): a is PickedArtist => !!a);

/** Artis acuan genre + "Penggemar mungkin juga suka" (kualitas terbaik) */
async function seedArtists(g: Genre): Promise<PickedArtist[]> {
  if (!g.seed) return [];
  let id = g.seed.id;
  let first: PickedArtist | null = null;
  if (!id) {
    const r = await search(g.seed.name, 'artists');
    first = artistsOf(r.sections.flatMap((s) => s.items))[0] || null;
    id = first?.id;
  }
  if (!id) return [];
  const b = await browse(id);
  const self: PickedArtist = first || { id, name: b.title || g.seed.name, thumbnail: b.thumbnail || '' };
  const related = artistsOf(b.sections.filter((s) => s.items.some((i) => i.type === 'artist')).flatMap((s) => s.items));
  return [self, ...related];
}

/** Artis dari pencarian genre, buang kanal kompilasi/instrumental */
async function searchArtists(g: Genre): Promise<PickedArtist[]> {
  const r = await search(g.q, 'artists');
  const all = artistsOf(r.sections.flatMap((s) => s.items));
  const clean = all.filter((a) => !JUNK.test(a.name) && a.name.toLowerCase() !== g.q.toLowerCase());
  return clean.length >= 5 ? clean : all;
}

/** Gabungkan beberapa daftar secara bergiliran tanpa duplikat */
function interleave(lists: PickedArtist[][], skip = new Set<string>()): PickedArtist[] {
  const out: PickedArtist[] = [];
  const seen = new Set(skip);
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let r = 0; r < max; r++)
    for (const l of lists) {
      const a = l[r];
      if (a && !seen.has(a.id)) { seen.add(a.id); out.push(a); }
    }
  return out;
}

function Avatar({ a, selected, onClick }: { a: PickedArtist; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group flex flex-col items-center gap-2 text-center animate-fade-in" aria-pressed={selected}>
      <span className="relative w-full aspect-square">
        <span className={`block w-full h-full rounded-full overflow-hidden bg-zinc-800 transition ${selected ? 'ring-[3px] ring-white' : 'group-hover:scale-[1.03]'}`}>
          {a.thumbnail && <img src={img(a.thumbnail, 300)} alt="" loading="lazy" referrerPolicy="no-referrer" crossOrigin="anonymous" draggable={false} className={`w-full h-full object-cover transition ${selected ? 'opacity-60' : ''}`} />}
        </span>
        {selected && (
          <span className="absolute right-0.5 top-0.5 w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-lg">
            <Check className="w-4 h-4 text-black" strokeWidth={3} />
          </span>
        )}
      </span>
      <span className={`text-[13px] font-semibold leading-tight line-clamp-2 ${selected ? 'text-white' : 'text-zinc-200'}`}>{a.name}</span>
    </button>
  );
}

export default function Onboarding() {
  const user = useAuth((s) => s.user);
  const prev = useTaste((s) => s.byUser[user.uid]);
  const save = useTaste((s) => s.save);
  const editing = !!prev && prev.updatedAt > 0;

  const [step, setStep] = useState<1 | 2>(1);
  const [genres, setGenres] = useState<string[]>(prev?.genres || []);
  const [picked, setPicked] = useState<PickedArtist[]>(prev?.artists || []);
  const [pool, setPool] = useState<PickedArtist[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PickedArtist[] | null>(null);
  const [searching, setSearching] = useState(false);
  const expanded = useRef(new Set<string>());
  const scroller = useRef<HTMLDivElement>(null);

  const pickedIds = useMemo(() => new Set(picked.map((a) => a.id)), [picked]);

  const toggleGenre = (id: string) => setGenres((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));

  const loadPool = async () => {
    setLoading(true);
    setError(null);
    try {
      const gs = genres.map(genreById).filter((g): g is Genre => !!g);
      const lists = await Promise.all(
        gs.flatMap((g) => [seedArtists(g).catch(() => []), searchArtists(g).catch(() => [])]),
      );
      // seed + terkait lebih dulu, lalu hasil pencarian
      const seeds = lists.filter((_, i) => i % 2 === 0);
      const found = lists.filter((_, i) => i % 2 === 1);
      const merged = interleave([...seeds, ...found]);
      // artis yang sudah dipilih sebelumnya tampil paling depan
      const ids = new Set(merged.map((a) => a.id));
      const all = [...picked.filter((a) => !ids.has(a.id)), ...merged];
      if (!all.length) throw new Error('empty');
      setPool(all);
    } catch {
      setError('Gagal memuat artis. Periksa koneksi lalu coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const toStep2 = () => {
    setStep(2);
    scroller.current?.scrollTo(0, 0);
    loadPool();
  };

  // Seperti Spotify: setelah memilih artis, artis serupa muncul tepat setelahnya
  const expand = async (a: PickedArtist) => {
    if (expanded.current.has(a.id)) return;
    expanded.current.add(a.id);
    try {
      const b = await browse(a.id);
      const rel = artistsOf(b.sections.filter((s) => s.items.some((i) => i.type === 'artist')).flatMap((s) => s.items));
      setPool((p) => {
        const have = new Set(p.map((x) => x.id));
        const add = rel.filter((x) => !have.has(x.id)).slice(0, 6);
        if (!add.length) return p;
        const at = p.findIndex((x) => x.id === a.id);
        if (at < 0) return [...add, ...p];
        return [...p.slice(0, at + 1), ...add, ...p.slice(at + 1)];
      });
    } catch {
      /* abaikan */
    }
  };

  const toggleArtist = (a: PickedArtist) => {
    if (pickedIds.has(a.id)) return setPicked((p) => p.filter((x) => x.id !== a.id));
    setPicked((p) => [...p, a]);
    setPool((p) => (p.some((x) => x.id === a.id) ? p : [a, ...p]));
    if (results) { setQ(''); setResults(null); }
    expand(a);
  };

  // pencarian artis (debounce)
  useEffect(() => {
    const s = q.trim();
    if (!s) { setResults(null); return; }
    setSearching(true);
    const t = window.setTimeout(async () => {
      try {
        const r = await search(s, 'artists');
        setResults(artistsOf(r.sections.flatMap((x) => x.items)).slice(0, 18));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const finish = (artists = picked) => save(user.uid, { genres, artists });
  const cancel = () => prev && save(user.uid, { genres: prev.genres, artists: prev.artists });

  const grid = 'grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-6';
  const shown = results ?? pool;

  return (
    <div ref={scroller} className="h-[100dvh] overflow-y-auto bg-[#121212] text-white">
      <div className="max-w-5xl mx-auto px-5 lg:px-8 pt-[max(env(safe-area-inset-top),16px)] pb-36">
        {/* bilah atas */}
        <div className="flex items-center gap-3 h-12">
          {step === 2 ? (
            <button onClick={() => setStep(1)} aria-label="Kembali" className="-ml-2 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10"><ChevronLeft className="w-7 h-7" /></button>
          ) : editing ? (
            <button onClick={cancel} aria-label="Batal" className="-ml-2 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10"><X className="w-6 h-6" /></button>
          ) : (
            <img src="/icon.svg" alt="" className="w-8 h-8 rounded-lg" />
          )}
          <div className="flex-1 flex gap-1.5 max-w-[160px] mx-auto">
            <span className="h-1 flex-1 rounded-full bg-spotify" />
            <span className={`h-1 flex-1 rounded-full transition ${step === 2 ? 'bg-spotify' : 'bg-zinc-700'}`} />
          </div>
          <span className="w-10" />
        </div>

        {step === 1 ? (
          <>
            <h1 className="mt-6 text-[28px] lg:text-4xl font-extrabold leading-tight tracking-tight">
              {editing ? 'Genre apa yang kamu suka?' : 'Hai, genre apa yang kamu suka?'}
            </h1>
            <p className="mt-2 text-zinc-400">Pilih satu atau lebih. Kami akan menyesuaikan rekomendasi untukmu.</p>
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {GENRES.map((g) => {
                const on = genres.includes(g.id);
                return (
                  <button
                    key={g.id}
                    onClick={() => toggleGenre(g.id)}
                    aria-pressed={on}
                    className={`relative h-[92px] lg:h-[108px] rounded-lg overflow-hidden text-left p-3.5 font-extrabold text-[17px] leading-tight transition active:scale-[.97] ${on ? 'ring-[3px] ring-white' : 'hover:brightness-110'}`}
                    style={{ background: g.color }}
                  >
                    <span className="relative z-10 drop-shadow">{g.name}</span>
                    <span className="absolute -right-4 -bottom-4 w-20 h-20 rotate-[25deg] rounded-md bg-black/20" />
                    {on && (
                      <span className="absolute right-2.5 top-2.5 w-6 h-6 rounded-full bg-white flex items-center justify-center">
                        <Check className="w-4 h-4 text-black" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-[28px] lg:text-4xl font-extrabold leading-tight tracking-tight">Pilih {MIN_ARTISTS} artis atau lebih yang kamu suka.</h1>
            <div className="sticky top-0 z-10 -mx-5 px-5 lg:-mx-8 lg:px-8 pt-4 pb-3 bg-[#121212]">
              <div className="relative">
                <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-black" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Cari artis"
                  className="w-full h-11 rounded-md bg-white text-black pl-11 pr-10 text-[15px] font-semibold outline-none placeholder:text-zinc-600 placeholder:font-semibold"
                />
                {q && (
                  <button onClick={() => setQ('')} aria-label="Hapus" className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-black">
                    {searching ? <Loader2 className="w-5 h-5 animate-spin" /> : <X className="w-5 h-5" />}
                  </button>
                )}
              </div>
            </div>

            {loading && !results ? (
              <div className={`${grid} mt-3 animate-pulse`}>
                {Array.from({ length: 18 }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center gap-2"><div className="w-full aspect-square rounded-full bg-white/10" /><div className="h-3 w-3/4 rounded bg-white/10" /></div>
                ))}
              </div>
            ) : error && !results ? (
              <div className="py-16 text-center space-y-4">
                <p className="text-zinc-400">{error}</p>
                <div className="flex justify-center gap-3">
                  <button onClick={loadPool} className="px-5 py-2 rounded-full bg-white text-black font-bold">Coba lagi</button>
                  <button onClick={() => finish()} className="px-5 py-2 rounded-full border border-zinc-500 font-bold">Lewati</button>
                </div>
              </div>
            ) : results && !results.length && !searching ? (
              <p className="py-16 text-center text-zinc-400">Artis "{q}" tidak ditemukan.</p>
            ) : (
              <div className={`${grid} mt-3`}>
                {shown.map((a) => <Avatar key={a.id} a={a} selected={pickedIds.has(a.id)} onClick={() => toggleArtist(a)} />)}
              </div>
            )}
          </>
        )}
      </div>

      {/* tombol bawah */}
      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#121212] via-[#121212]/95 to-transparent pt-10 pb-[max(env(safe-area-inset-bottom),20px)]">
        <div className="flex justify-center">
          {step === 1 ? (
            <button
              onClick={toStep2}
              disabled={!genres.length}
              className="px-10 h-12 rounded-full bg-white text-black font-bold text-[15px] hover:scale-105 transition disabled:opacity-40 disabled:hover:scale-100"
            >
              {genres.length ? `Lanjut (${genres.length})` : 'Pilih minimal 1 genre'}
            </button>
          ) : (
            <button
              onClick={() => finish()}
              disabled={picked.length < MIN_ARTISTS}
              className="px-10 h-12 rounded-full bg-white text-black font-bold text-[15px] hover:scale-105 transition disabled:opacity-40 disabled:hover:scale-100"
            >
              {picked.length >= MIN_ARTISTS ? `Selesai (${picked.length})` : `Pilih ${MIN_ARTISTS - picked.length} lagi`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
