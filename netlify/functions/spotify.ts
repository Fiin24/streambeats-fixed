import { getSpotifyCollection } from '../../api/_lib/spotify.js';

// Netlify Function (format v2): /api/spotify?url=... → daftar lagu playlist Spotify publik
export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  try {
    const data = await getSpotifyCollection(url.searchParams.get('url') || '');
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Gagal membaca Spotify' }), { status: e?.status || 502, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
};
