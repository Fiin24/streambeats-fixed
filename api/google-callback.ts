import { respond } from './_lib/vercelAuth.js';

// Vercel: redirect URI login Google → https://situs-kamu/api/google-callback
export default function handler(req: any, res: any) {
  return respond(req, res, 'google-callback');
}
