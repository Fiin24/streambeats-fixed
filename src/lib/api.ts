import type { BrowsePage, HomePage, Item, NextPage, Section } from './types';
import { useSettings } from '../store/settings';

const cache = new Map<string, Promise<unknown>>();

export function api<T>(params: Record<string, string | undefined>, useCache = true): Promise<T> {
  const { hl, gl } = useSettings.getState();
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, hl, gl })) if (v) sp.set(k, v);
  const key = sp.toString();
  if (useCache && cache.has(key)) return cache.get(key) as Promise<T>;
  const p = fetch(`/api/yt?${key}`).then(async (r) => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Gagal memuat (${r.status})`);
    return j as T;
  });
  p.catch(() => cache.delete(key));
  cache.set(key, p);
  return p;
}

export const getHome = (params?: string, continuation?: string) =>
  api<HomePage>({ action: 'home', params, continuation, pages: continuation ? '2' : '3' });
export const search = (q: string, filter?: string) => api<{ sections: Section[] }>({ action: 'search', q, filter });
export const suggest = (q: string) => api<{ queries: string[]; items: Item[] }>({ action: 'suggest', q });
export const getNext = (videoId?: string, playlistId?: string) => api<NextPage>({ action: 'next', videoId, playlistId });
export const browse = (id: string, params?: string) => api<BrowsePage>({ action: 'browse', id, params });
export const getCharts = (country: string) => api<BrowsePage>({ action: 'charts', country });
export const ytLyrics = (id: string) => api<{ text?: string; source?: string }>({ action: 'lyrics', id });
export const status = () => api<{ ok: boolean; dataApiFallback: boolean }>({ action: 'status' }, false);
