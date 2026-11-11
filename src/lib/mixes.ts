/**
 * Daily Mix ala Spotify — dibuat di perangkat dari Lagu Disukai & riwayat putar.
 * Artis teratas diberi skor (disukai ×2, riwayat ×1). Tiap mix dipimpin satu artis,
 * lalu diisi radio YouTube Music dari lagu-lagu milik pengguna. Daftar mix diperbarui sekali sehari.
 */
import type { Track } from './types';
import { isPlayable } from './types';
import { getNext } from './api';
import { usePlayer } from '../store/player';

export interface MixDef {
  id: string; // dm1..dm6 | liked
  title: string;
  artist: string;
  desc: string;
  color: string;
  cover?: string;
  seeds: Track[];
}

const COLORS = ['#e8115b', '#1e3264', '#148a08', '#8d67ab', '#e1118c', '#bc5900', '#509bf5'];
const KEY = 'sb-daily-v2';
const today = () => new Date().toISOString().slice(0, 10);
const shuffle = <T,>(a: T[]) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

export function buildMixes(liked: Track[], history: Track[]): MixDef[] {
  const score = new Map<string, { name: string; score: number; tracks: Map<string, Track> }>();
  const add = (t: Track, w: number) => {
    const a = t.artists?.[0];
    if (!a?.name) return;
    const k = a.name.trim().toLowerCase(); // gabungkan berdasarkan nama (ID artis kadang berbeda)
    const e = score.get(k) || { name: a.name, score: 0, tracks: new Map() };
    e.score += w;
    e.tracks.set(t.videoId, t);
    score.set(k, e);
  };
  liked.forEach((t) => add(t, 2));
  history.forEach((t) => add(t, 1));
  const ranked = [...score.values()].sort((a, b) => b.score - a.score);
  const top = ranked.slice(0, 6);
  const mixes: MixDef[] = top.map((e, i) => {
    const others = [...new Set(ranked.filter((x) => x !== e).slice(i, i + 2).map((x) => x.name))];
    const seeds = [...e.tracks.values()];
    return {
      id: `dm${i + 1}`,
      title: `Daily Mix ${i + 1}`,
      artist: e.name,
      desc: [e.name, ...others].join(', ') + ' dan lainnya',
      color: COLORS[i % COLORS.length],
      cover: seeds[0]?.thumbnail,
      seeds,
    };
  });
  if (liked.length >= 5)
    mixes.push({
      id: 'liked',
      title: 'Mix Lagu Disukai',
      artist: 'Lagu Disukai',
      desc: 'Lagu favoritmu dan yang mirip dengannya',
      color: '#450af5',
      cover: liked[0]?.thumbnail,
      seeds: liked.slice(0, 30),
    });
  return mixes;
}

/** Daftar mix hari ini (snapshot harian agar tidak berubah-ubah sepanjang hari) */
export function dailyMixes(): MixDef[] {
  const { liked, history } = usePlayer.getState();
  try {
    const snap = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (snap?.date === today() && snap.mixes?.length) return snap.mixes;
  } catch {
    /* abaikan */
  }
  const mixes = buildMixes(liked, history);
  if (mixes.length) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ date: today(), mixes }));
    } catch {
      /* penyimpanan penuh — mix tetap ditampilkan tanpa snapshot */
    }
  }
  return mixes;
}

export const findMix = (id: string) => dailyMixes().find((m) => m.id === id);

const cache = new Map<string, Promise<Track[]>>();
/** Isi mix: radio dari 2 lagu benih, diselingi lagu milik pengguna (± 1 dari 4) */
export function loadMix(def: MixDef): Promise<Track[]> {
  const key = `${today()}:${def.id}`;
  if (!cache.has(key)) {
    const p = (async () => {
      const seeds = shuffle(def.seeds);
      const radios = await Promise.all(seeds.slice(0, 2).map((s) => getNext(s.videoId).then((n) => n.tracks.filter(isPlayable)).catch(() => [] as Track[])));
      const seen = new Set<string>();
      const radio: Track[] = [];
      for (let r = 0; radios.some((x) => x.length > r); r++)
        for (const x of radios) {
          const t = x[r];
          if (t && !seen.has(t.videoId)) { seen.add(t.videoId); radio.push(t); }
        }
      const own = seeds.filter((s) => !seen.has(s.videoId));
      const out: Track[] = [];
      radio.slice(0, 45).forEach((t, i) => {
        out.push(t);
        if (i % 4 === 3 && own.length) out.push(own.shift()!);
      });
      out.push(...own.slice(0, 5));
      if (!out.length) throw new Error('Gagal memuat mix');
      return out.slice(0, 50);
    })();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key)!;
}
