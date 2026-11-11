import { respond } from './_lib/vercelAuth.js';

// Vercel Serverless Function: /api/auth?action=… (lihat api/_lib/vercelAuth.ts)
export default function handler(req: any, res: any) {
  return respond(req, res);
}
