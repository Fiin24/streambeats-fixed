/**
 * Impor playlist Spotify: ambil daftar lagu lewat /api/spotify, lalu cocokkan tiap lagu
 * ke YouTube Music (pencarian "Lagu") berdasarkan judul, artis & durasi.
 */
import { search } from './api';
import type { Track } from './types';
import { isPlayable } from './types';

export interface SpTrack { title: string; artists: string[]; album?: string; durationMs?: number; uri?: string }
export interface SpCollection {
  kind: 'playlist' | 'album' | 'track'; id: string; name: string; owner?: string; cover?: string; url: string;
  total: number; tracks: SpTrack[]; partial?: boolean;
}
export interface MatchResult { source: SpTrack; track: Track | null; score: number }

export async function fetchSpotify(url: string): Promise<SpCollection> {
  const r = await fetch(`/api/spotify?url=${encodeURIComponent(url.trim())}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Gagal membaca Spotify (${r.status})`);
  return j as SpCollection;
}

/** Hapus embel-embel yang jarang ada di judul YouTube Music */
export function cleanTitle(t: string): string {
  return t
    .replace(/\s*[([](feat\.?|ft\.?|with|featuring)\s[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+(\d{4}\s+)?(re-?master(ed)?|remaster(ed)?\s+\d{4}|\d{4}\s+remaster(ed)?|mono|stereo|single version|radio edit|album version|original mix)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}
const norm = (s: string) =>
  s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const tokens = (s: string) => new Set(norm(s).split(' ').filter(Boolean));

function similarity(a: string, b: string): number {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const t of A) if (B.has(t)) hit++;
  return hit / Math.max(A.size, Math.min(B.size, A.size + 2));
}

interface Score { total: number; title: number; artist: number; dur: number }
function score(c: Track, s: SpTrack): Score {
  const title = similarity(cleanTitle(s.title), c.title);
  const cArtists = norm((c.artists || []).map((a) => a.name).join(' ') + ' ' + (c.subtitle || ''));
  const first = norm(c.artists?.[0]?.name || '');
  const artist = s.artists.some((a) => { const n = norm(a); return !!n && (cArtists.includes(n) || (!!first && n.includes(first))); }) ? 1 : 0;
  let dur = 0.3;
  if (s.durationMs && c.duration) {
    const d = Math.abs(c.duration - s.durationMs / 1000);
    dur = d <= 3 ? 1 : d <= 8 ? 0.7 : d <= 20 ? 0.35 : d <= 45 ? 0.1 : 0;
  }
  return { total: title * 0.5 + artist * 0.3 + dur * 0.2, title, artist, dur };
}
/** Diterima bila artis cocok, atau (tanpa artis cocok) judul & durasi hampir persis sama */
const acceptable = (x: Score) => x.total >= 0.4 && (x.artist === 1 || (x.title >= 0.9 && x.dur === 1));

async function candidates(q: string, filter: string): Promise<Track[]> {
  const r = await search(q, filter).catch(() => null);
  return (r?.sections || []).flatMap((s) => s.items).filter(isPlayable).slice(0, 8) as Track[];
}

export async function matchTrack(s: SpTrack): Promise<MatchResult> {
  const title = cleanTitle(s.title);
  const q = `${title} ${s.artists.slice(0, 2).join(' ')}`.trim();
  let best: { track: Track | null; sc: Score } = { track: null, sc: { total: 0, title: 0, artist: 0, dur: 0 } };
  const pick = (arr: Track[]) => {
    for (const c of arr) {
      const sc = score(c, s);
      const better = acceptable(sc) && !acceptable(best.sc) ? true : acceptable(sc) === acceptable(best.sc) && sc.total > best.sc.total;
      if (better) best = { track: c, sc };
    }
  };
  pick(await candidates(q, 'songs'));
  // belum yakin → coba juga "Video" (lagu indie / cover sering hanya ada sebagai video)
  if (!acceptable(best.sc) || best.sc.total < 0.75) pick(await candidates(q, 'videos'));
  return acceptable(best.sc) ? { source: s, track: best.track, score: best.sc.total } : { source: s, track: null, score: best.sc.total };
}

/** Cocokkan banyak lagu sekaligus (paralel terbatas) dengan laporan progres */
export async function matchAll(
  tracks: SpTrack[],
  onProgress: (done: number, result: MatchResult, index: number) => void,
  signal?: AbortSignal,
  parallel = 4,
): Promise<MatchResult[]> {
  const out: MatchResult[] = new Array(tracks.length);
  let next = 0, done = 0;
  const worker = async () => {
    while (next < tracks.length) {
      if (signal?.aborted) return;
      const i = next++;
      let r: MatchResult;
      try { r = await matchTrack(tracks[i]); } catch { r = { source: tracks[i], track: null, score: 0 }; }
      out[i] = r;
      done++;
      onProgress(done, r, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, tracks.length) }, worker));
  return out;
}
