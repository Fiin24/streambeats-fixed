import { handle } from './_lib/router.js';

// Vercel Serverless Function: /api/yt?action=home|search|suggest|next|browse|lyrics|status
export default async function handler(req: any, res: any) {
  const url = new URL(req.url || '/', 'http://localhost');
  const result = await handle(Object.fromEntries(url.searchParams));
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', result.cache || 'no-store');
  res.statusCode = result.status;
  res.end(JSON.stringify(result.body));
}
