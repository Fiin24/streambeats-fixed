import { respond } from '../shared/authRespond.js';

// Netlify: redirect URI login Google → https://situs-kamu/api/google-callback (lihat netlify.toml)
export default (req: Request): Promise<Response> => respond(req, 'google-callback');
