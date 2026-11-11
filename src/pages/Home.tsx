import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { getHome, search } from '../lib/api';
import type { Chip, Item, Section } from '../lib/types';
import MobileHeader from '../components/MobileHeader';
import MoodPills, { MOOD_TO_CHIP } from '../components/MoodPills';
import Spotlight from '../components/Spotlight';
import SpeedDial from '../components/SpeedDial';
import Shelf from '../components/Shelf';
import DailyMixes from '../components/DailyMixes';
import ForYou from '../components/ForYou';
import { InstallCard } from '../components/PwaBanners';
import HomeHero, { FindFriends } from '../components/HomeHero';

function Skeleton() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="h-[200px] sm:h-[260px] lg:h-[300px] rounded-2xl bg-white/5 flex items-center gap-5 p-5 sm:p-7">
        <div className="h-[128px] w-[128px] sm:h-[188px] sm:w-[188px] lg:h-[228px] lg:w-[228px] rounded-xl bg-white/5" />
        <div className="flex-1 space-y-3"><div className="h-4 w-28 rounded-full bg-white/5" /><div className="h-8 w-3/4 rounded bg-white/5" /><div className="h-4 w-1/2 rounded bg-white/5" /></div>
      </div>
      {[0, 1].map((k) => (
        <div key={k}>
          <div className="h-6 w-48 rounded bg-white/5 mb-4" />
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="w-[140px] shrink-0">
                <div className="aspect-square rounded-lg bg-white/5" />
                <div className="h-3 mt-2 rounded bg-white/5" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Ambil campuran item dari semua bagian secara bergiliran (round-robin) */
function roundRobin(sections: Section[], n: number, skip: Set<string>): Item[] {
  const pools = sections.map((s) => s.items.filter((i) => !skip.has(i.id) && i.thumbnail));
  const out: Item[] = [];
  const seen = new Set<string>();
  for (let r = 0; out.length < n && pools.some((p) => p.length > r); r++)
    for (const p of pools) {
      const it = p[r];
      if (it && !seen.has(it.id)) { seen.add(it.id); out.push(it); if (out.length >= n) break; }
    }
  return out;
}

export default function Home() {
  const [chips, setChips] = useState<Chip[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [cont, setCont] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [moodResult, setMoodResult] = useState<Section[] | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const baseChips = useRef<Chip[]>([]);

  const load = useCallback(async (params?: string) => {
    setLoading(true);
    setError(null);
    try {
      const h = await getHome(params);
      setSections(h.sections);
      setCont(h.continuation);
      if (!params) { baseChips.current = h.chips; setChips(h.chips); }
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat beranda');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectMood = async (m: string | null) => {
    setMood(m);
    setMoodResult(null);
    if (!m) return load();
    const names = (MOOD_TO_CHIP[m] || [m]).map((x) => x.toLowerCase());
    const chip = (baseChips.current.length ? baseChips.current : chips).find((c) => names.includes(c.title.toLowerCase()));
    if (chip) return load(chip.params);
    // tidak ada chip padanan: gunakan pencarian sebagai cadangan
    setLoading(true);
    try {
      const r = await search(`${m} music`);
      setMoodResult(r.sections);
      setCont(undefined);
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat');
    } finally {
      setLoading(false);
    }
  };

  // infinite scroll
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cont || loading) return;
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting || more) return;
      setMore(true);
      try {
        const h = await getHome(undefined, cont);
        setSections((s) => {
          const titles = new Set(s.map((x) => x.title));
          return [...s, ...h.sections.filter((x) => !titles.has(x.title))];
        });
        setCont(h.continuation);
      } catch {
        setCont(undefined);
      } finally {
        setMore(false);
      }
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [cont, loading, more]);

  const shown = moodResult || sections;
  const spotlight = useMemo(() => {
    const cards = shown.filter((s) => s.layout === 'cards').flatMap((s) => s.items).filter((i) => i.thumbnail && i.type !== 'artist');
    const songs = cards.filter((i) => i.videoId);
    const pool = songs.length >= 3 ? songs : cards.length >= 3 ? cards : shown.flatMap((s) => s.items);
    return pool.slice(0, 3);
  }, [shown]);
  const spotIds = useMemo(() => new Set(spotlight.map((s) => s.id)), [spotlight]);
  const speed = useMemo(() => roundRobin(shown, 27, spotIds), [shown, spotIds]);
  // pintasan cadangan untuk pengguna baru (belum ada riwayat / playlist)
  const quick = useMemo(() => roundRobin(sections, 8, spotIds), [sections, spotIds]);

  return (
    <div className="px-5 lg:px-6 pb-8">
      <MobileHeader subtitle="Stream Beats" />
      <HomeHero fallback={quick} />
      <div className="lg:hidden -mt-3 mb-2"><MoodPills active={mood} onSelect={selectMood} /></div>
      <div className="lg:pt-1">
        <InstallCard />
        {loading ? (
          <Skeleton />
        ) : error ? (
          <div className="flex flex-col items-center text-center py-20 gap-4">
            <p className="text-zinc-400">{error}</p>
            <button onClick={() => (mood ? selectMood(mood) : load())} className="flex items-center gap-2 px-5 py-2 rounded-full bg-white text-black font-bold">
              <RefreshCw className="w-4 h-4" /> Coba lagi
            </button>
          </div>
        ) : (
          <>
            <Spotlight items={spotlight} />
            <SpeedDial items={speed} />
            {!mood && <ForYou />}
            {!mood && <DailyMixes />}
            {!mood && <FindFriends />}
            {shown.map((s, i) => <Shelf key={`${s.title}-${i}`} section={s} />)}
            <div ref={sentinel} className="h-10 flex items-center justify-center">
              {more && <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
