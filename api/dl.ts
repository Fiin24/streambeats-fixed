import { handleDl } from './_lib/audio.js';

// Vercel Serverless Function: /api/dl?id=VIDEO_ID&start=0&end=... → potongan audio (≤ 3,5 MB)

export default async function handler(req: any, res: any) {
  const url = new URL(req.url || '/', 'http://localhost');
  const r = await handleDl(Object.fromEntries(url.searchParams));
  for (const [k, v] of Object.entries(r.headers)) res.setHeader(k, v);
  res.statusCode = r.status;
  res.end(typeof r.body === 'string' ? r.body : Buffer.from(r.body));
}
