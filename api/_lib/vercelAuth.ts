import { handleAuth, clientIp } from './auth.js';

// Adapter Vercel untuk /api/auth?action=status|check-username|register|login|me|update|password|logout-all|delete|sync
//   |avatar-upload|avatar-remove|avatar (gambar)|users (cari pengguna)|profile|user-playlist|google-start|google-exchange
// (/api/google-callback ditangani api/google-callback.ts)
export async function respond(req: any, res: any, forceAction?: string) {
  const url = new URL(req.url || '/', 'http://localhost');
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const r = await handleAuth({
    method: req.method || 'GET', action: forceAction || url.searchParams.get('action') || '', body: body || {},
    query: Object.fromEntries(url.searchParams), headers: req.headers || {}, ip: clientIp(req.headers || {}),
  });
  res.statusCode = r.status;
  for (const [k, v] of Object.entries(r.headers || {})) res.setHeader(k, v);
  if (r.raw) {
    res.setHeader('Content-Type', r.raw.type);
    res.setHeader('Cache-Control', r.raw.cache);
    res.end(r.raw.data);
    return;
  }
  if (r.status >= 300 && r.status < 400) { res.end(); return; } // redirect (login Google)
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(r.body));
}
