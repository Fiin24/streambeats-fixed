import { getSpotifyCollection } from './_lib/spotify.js';

// Vercel Serverless Function: /api/spotify?url=<link playlist/album/lagu Spotify>

export default async function handler(req: any, res: any) {
  const url = new URL(req.url || '/', 'http://localhost');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const data = await getSpotifyCollection(url.searchParams.get('url') || '');
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    res.statusCode = 200;
    res.end(JSON.stringify(data));
  } catch (e: any) {
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = e?.status || 502;
    res.end(JSON.stringify({ error: e?.message || 'Gagal membaca Spotify' }));
  }
}
