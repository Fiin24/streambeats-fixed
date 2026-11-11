import type { Track } from './types';
import { getNext, ytLyrics } from './api';
import { artistNames } from './format';

export interface LyricLine { time: number; text: string }
export interface Lyrics { synced: LyricLine[] | null; plain: string | null; source: string }

const cache = new Map<string, Promise<Lyrics>>();

const cleanTitle = (t: string) =>
  t
    .replace(/\s*[([](official|lyric|lyrics|audio|video|mv|music video|visualizer|live|hd|hq|4k)[^)\]]*[)\]]/gi, '')
    .replace(/\s*[|｜].*$/, '')
    .replace(/\s*-\s*(official|lyric|lyrics).*$/i, '')
    .trim();

export function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!tags.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of tags) {
      const frac = m[3] ? Number(m[3].padEnd(3, '0')) / 1000 : 0;
      out.push({ time: Number(m[1]) * 60 + Number(m[2]) + frac, text });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

async function lrclib(track: Track, duration?: number): Promise<Lyrics | null> {
  const title = cleanTitle(track.title);
  const artist = track.artists?.[0]?.name || artistNames(track);
  const headers = { 'Lrclib-Client': 'StreamBeats Web (https://github.com/)' };
  try {
    const p = new URLSearchParams({ track_name: title, artist_name: artist });
    if (track.album?.name) p.set('album_name', track.album.name);
    if (duration) p.set('duration', String(Math.round(duration)));
    const r = await fetch(`https://lrclib.net/api/get?${p}`, { headers });
    if (r.ok) {
      const j = await r.json();
      if (j.syncedLyrics || j.plainLyrics)
        return { synced: j.syncedLyrics ? parseLrc(j.syncedLyrics) : null, plain: j.plainLyrics || null, source: 'LRCLIB' };
    }
    const s = await fetch(`https://lrclib.net/api/search?${new URLSearchParams({ track_name: title, artist_name: artist })}`, { headers });
    if (s.ok) {
      const list: any[] = await s.json();
      const best =
        list.find((x) => x.syncedLyrics && (!duration || Math.abs(x.duration - duration) < 6)) ||
        list.find((x) => x.syncedLyrics) ||
        list.find((x) => x.plainLyrics);
      if (best) return { synced: best.syncedLyrics ? parseLrc(best.syncedLyrics) : null, plain: best.plainLyrics || null, source: 'LRCLIB' };
    }
  } catch {
    /* jaringan gagal — lanjut ke sumber berikutnya */
  }
  return null;
}

async function youtubeMusic(track: Track): Promise<Lyrics | null> {
  try {
    const n = await getNext(track.videoId);
    if (!n.lyricsBrowseId) return null;
    const l = await ytLyrics(n.lyricsBrowseId);
    return l.text ? { synced: null, plain: l.text, source: l.source?.replace(/^Sumber:\s*/i, '') || 'YouTube Music' } : null;
  } catch {
    return null;
  }
}

export function fetchLyrics(track: Track, duration?: number): Promise<Lyrics> {
  const key = track.videoId;
  if (!cache.has(key)) {
    const p = (async () => (await lrclib(track, duration || track.duration)) || (await youtubeMusic(track)) || { synced: null, plain: null, source: '' })();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key)!;
}
