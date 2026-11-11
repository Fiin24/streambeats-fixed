import { handleAuth, clientIp } from '../../api/_lib/auth.js';

// Netlify Function (format v2): /api/auth → akun (daftar username + password / Google, masuk, sinkronisasi, foto profil, cari pengguna)
export async function respond(req: Request, forceAction?: string): Promise<Response> {
  const url = new URL(req.url);
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k] = v));
  if (!headers['x-forwarded-host'] && !headers.host) headers.host = url.host;
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const r = await handleAuth({
    method: req.method, action: forceAction || url.searchParams.get('action') || '', body, query: Object.fromEntries(url.searchParams), headers, ip: clientIp(headers),
  });
  const extra = r.headers || {};
  if (r.raw) return new Response(new Uint8Array(r.raw.data), { status: r.status, headers: { ...extra, 'Content-Type': r.raw.type, 'Cache-Control': r.raw.cache } });
  if (r.status >= 300 && r.status < 400) return new Response(null, { status: r.status, headers: extra }); // redirect (login Google)
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { ...extra, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
