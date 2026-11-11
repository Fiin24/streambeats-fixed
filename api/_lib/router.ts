import * as yt from './innertube.js';
import { serverMirrors } from './audio.js';

export interface ApiResult { status: number; body: unknown; cache?: string }
type Q = Record<string, string | undefined>;

const SHORT = 'public, s-maxage=600, stale-while-revalidate=1800';
const LONG = 'public, s-maxage=86400, stale-while-revalidate=604800';

export async function handle(q: Q, env: Record<string, string | undefined> = process.env): Promise<ApiResult> {
  const loc = { hl: q.hl || 'id', gl: q.gl || 'ID' };
  try {
    switch (q.action) {
      case 'home':
        return { status: 200, cache: SHORT, body: await yt.home({ params: q.params, continuation: q.continuation, pages: q.pages ? Number(q.pages) : undefined, ...loc }) };
      case 'search': {
        if (!q.q) return { status: 400, body: { error: 'Parameter q wajib diisi' } };
        try {
          return { status: 200, cache: SHORT, body: await yt.search(q.q, q.filter, loc) };
        } catch (e) {
          const key = env.YOUTUBE_API_KEY;
          if (key) return { status: 200, cache: SHORT, body: await yt.dataApiSearch(q.q, key) };
          throw e;
        }
      }
      case 'suggest':
        if (!q.q) return { status: 200, body: { queries: [], items: [] } };
        return { status: 200, cache: SHORT, body: await yt.suggestions(q.q, loc) };
      case 'next':
        if (!q.videoId && !q.playlistId) return { status: 400, body: { error: 'videoId atau playlistId wajib diisi' } };
        return { status: 200, cache: SHORT, body: await yt.next({ videoId: q.videoId, playlistId: q.playlistId, params: q.params, ...loc }) };
      case 'browse':
        if (!q.id) return { status: 400, body: { error: 'Parameter id wajib diisi' } };
        return { status: 200, cache: SHORT, body: await yt.browse(q.id, q.params, loc) };
      case 'charts': {
        // tangga lagu YouTube Music per negara (kode ISO 2 huruf, mis. ID / US / ZZ = global)
        const cc = String(q.country || loc.gl).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) || 'ID';
        return { status: 200, cache: SHORT, body: await yt.browse('FEmusic_charts', undefined, loc, { formData: { selectedValues: [cc] } }) };
      }
      case 'lyrics':
        if (!q.id) return { status: 400, body: { error: 'Parameter id wajib diisi' } };
        return { status: 200, cache: LONG, body: await yt.lyrics(q.id, loc) };
      case 'mirrors':
        // daftar mirror audio cadangan (Piped/Invidious) untuk unduhan offline di perangkat
        return { status: 200, cache: 'public, s-maxage=21600, stale-while-revalidate=86400', body: { mirrors: await serverMirrors() } };
      case 'status':
        return { status: 200, cache: 'no-store', body: { ok: true, source: 'innertube', dataApiFallback: Boolean(env.YOUTUBE_API_KEY) } };
      default:
        return { status: 404, body: { error: 'Aksi tidak dikenal' } };
    }
  } catch (e: any) {
    return { status: 502, cache: 'no-store', body: { error: e?.message || 'Gagal menghubungi YouTube Music' } };
  }
}
