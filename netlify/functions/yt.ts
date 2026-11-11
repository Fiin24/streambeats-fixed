import { handle } from '../../api/_lib/router.js';

// Netlify Function (format v2): /api/yt?action=home|search|suggest|next|browse|lyrics|status
// Dipetakan dari /api/yt lewat redirect di netlify.toml
export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const result = await handle(Object.fromEntries(url.searchParams), process.env);
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': result.cache || 'no-store',
    },
  });
};
