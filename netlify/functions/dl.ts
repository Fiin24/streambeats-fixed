import { handleDl } from '../../api/_lib/audio.js';

// Netlify Function (format v2): /api/dl → potongan audio untuk unduhan offline
export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const r = await handleDl(Object.fromEntries(url.searchParams));
  return new Response(r.body as BodyInit, { status: r.status, headers: r.headers });
};
