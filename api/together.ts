import { handleTogether, CORS_HEADERS } from './_lib/together.js';

// Vercel Serverless Function: /api/together?action=status|create|join|poll|update|member|transfer|suggest|suggestion|leave|close
export default async function handler(req: any, res: any) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  const url = new URL(req.url || '/', 'http://localhost');
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const r = await handleTogether({ method: req.method || 'GET', action: url.searchParams.get('action') || '', body: body || {} });
  res.statusCode = r.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(r.body));
}
