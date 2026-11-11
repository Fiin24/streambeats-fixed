import { respond } from '../shared/authRespond.js';

// Netlify Function (format v2): /api/auth → akun (daftar username + password / Google, masuk, sinkronisasi, foto profil, cari pengguna)
export default (req: Request): Promise<Response> => respond(req);
