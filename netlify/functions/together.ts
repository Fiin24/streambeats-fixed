import { handleTogether, CORS_HEADERS } from '../../api/_lib/together.js';

// Netlify Function (format v2): /api/together → Dengar bersama (ruangan real time, lihat api/_lib/together.ts)
export default async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  const url = new URL(req.url);
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const r = await handleTogether({ method: req.method, action: url.searchParams.get('action') || '', body });
  return new Response(JSON.stringify(r.body), {
    status: r.status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
};
