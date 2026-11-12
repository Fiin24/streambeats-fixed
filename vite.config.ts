import { defineConfig, loadEnv, type Plugin, type Connect } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { handle } from './api/_lib/router.js';
import { handleDl } from './api/_lib/audio.js';
import { getSpotifyCollection } from './api/_lib/spotify.js';
import { resolve } from 'node:path';
import { handleAuth, clientIp } from './api/_lib/auth.js';
import { handleTogether, CORS_HEADERS } from './api/_lib/together.js';

/** Menjalankan /api/yt, /api/dl, /api/spotify, /api/auth & /api/together secara lokal (dev & preview) — di Vercel ditangani oleh folder api/ */
function ytApi(env: Record<string, string>): Plugin {
  const mw: Connect.NextHandleFunction = async (req, res, next) => {
    if (req.url?.startsWith('/api/auth') || req.url?.startsWith('/api/google-callback')) {
      // akun: mode dev otomatis (penyimpanan memori) bila Upstash belum diisi
      const chunks: Buffer[] = [];
      for await (const ch of req) chunks.push(ch as Buffer);
      let body: any = {};
      try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}; } catch { body = {}; }
      const url = new URL(req.url, 'http://localhost');
      const r = await handleAuth(
        { method: req.method || 'GET', action: url.pathname === '/api/google-callback' ? 'google-callback' : url.searchParams.get('action') || '', body, query: Object.fromEntries(url.searchParams), headers: req.headers, ip: clientIp(req.headers) || req.socket.remoteAddress },
        { dev: env.AUTH_DEV !== '0', env },
      );
      res.statusCode = r.status;
      for (const [k, val] of Object.entries(r.headers || {})) res.setHeader(k, val);
      if (r.raw) {
        res.setHeader('Content-Type', r.raw.type);
        res.setHeader('Cache-Control', r.raw.cache);
        res.end(r.raw.data);
        return;
      }
      if (r.status >= 300 && r.status < 400) { res.end(); return; }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(r.body));
      return;
    }
    if (req.url?.startsWith('/api/together')) {
      // Dengar bersama: penyimpanan memori saat dev bila Upstash belum diisi
      for (const [k, val] of Object.entries(CORS_HEADERS)) res.setHeader(k, val);
      if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
      const chunks: Buffer[] = [];
      for await (const ch of req) chunks.push(ch as Buffer);
      let body: any = {};
      try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}; } catch { body = {}; }
      const url = new URL(req.url, 'http://localhost');
      const r = await handleTogether({ method: req.method || 'GET', action: url.searchParams.get('action') || '', body }, { dev: env.AUTH_DEV !== '0', env });
      res.statusCode = r.status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(r.body));
      return;
    }
    if (req.url?.startsWith('/api/dl')) {
      const r = await handleDl(Object.fromEntries(new URL(req.url, 'http://localhost').searchParams));
      for (const [k, v] of Object.entries(r.headers)) res.setHeader(k, v);
      res.statusCode = r.status;
      res.end(typeof r.body === 'string' ? r.body : Buffer.from(r.body));
      return;
    }
    if (req.url?.startsWith('/api/spotify')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      try {
        const data = await getSpotifyCollection(new URL(req.url, 'http://localhost').searchParams.get('url') || '');
        res.statusCode = 200;
        res.end(JSON.stringify(data));
      } catch (e: any) {
        res.statusCode = e?.status || 502;
        res.end(JSON.stringify({ error: e?.message || 'Gagal membaca Spotify' }));
      }
      return;
    }
    if (!req.url?.startsWith('/api/yt')) return next();
    const url = new URL(req.url, 'http://localhost');
    const r = await handle(Object.fromEntries(url.searchParams), { ...process.env, ...env });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.statusCode = r.status;
    res.end(JSON.stringify(r.body));
  };
  return {
    name: 'yt-api',
    configureServer: (s) => void s.middlewares.use(mw),
    configurePreviewServer: (s) => void s.middlewares.use(mw),
  };
}

/** PWA: bisa diinstal + cache offline (Workbox) */
const pwa = () =>
  VitePWA({
    registerType: 'prompt', // tampilkan "Versi baru tersedia" alih-alih memuat ulang diam-diam saat musik diputar
    injectRegister: false, // didaftarkan manual di src/lib/pwa.ts
    includeAssets: ['icon.svg', 'favicon-64.png', 'apple-touch-icon.png', 'about/dev-banner.jpg', 'about/dev-avatar.jpg'],
    manifest: {
      id: '/',
      name: 'Stream Beats',
      short_name: 'Stream Beats',
      description: 'Platform streaming musik modern gratis tanpa iklan',
      lang: 'id',
      dir: 'ltr',
      start_url: '/?source=pwa',
      scope: '/',
      display: 'standalone',
      orientation: 'any',
      background_color: '#000000',
      theme_color: '#000000',
      categories: ['music', 'entertainment'],
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        { src: '/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      ],
      shortcuts: [
        { name: 'Cari', short_name: 'Cari', url: '/search?source=pwa', icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }] },
        { name: 'Lagu Disukai', short_name: 'Disukai', url: '/liked?source=pwa', icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }] },
        { name: 'Koleksi Kamu', short_name: 'Koleksi', url: '/library?source=pwa', icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }] },
      ],
      screenshots: [
        { src: '/screenshots/wide.jpg', sizes: '1440x900', type: 'image/jpeg', form_factor: 'wide', label: 'Beranda Stream Beats di desktop' },
        { src: '/screenshots/narrow.jpg', sizes: '780x1688', type: 'image/jpeg', form_factor: 'narrow', label: 'Beranda Stream Beats di ponsel' },
        { src: '/screenshots/narrow-lyrics.jpg', sizes: '780x1688', type: 'image/jpeg', form_factor: 'narrow', label: 'Lirik layar penuh' },
      ],
    },
    workbox: {
      // app shell: semua aset hasil build (kecuali screenshot manifest)
      globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      globIgnores: ['screenshots/**'],
      navigateFallback: '/index.html',
      navigateFallbackDenylist: [/^\/api\//],
      cleanupOutdatedCaches: true,
      // versi baru langsung aktif (tidak menunggu semua tab/aplikasi ditutup) → tidak ada lagi
      // tampilan lama yang "nyangkut" di cache. Halaman dimuat ulang otomatis saat musik tidak diputar (src/lib/pwa.ts).
      skipWaiting: true,
      clientsClaim: true,
      runtimeCaching: [
        {
          // data YouTube Music (beranda, pencarian, album, artis, radio): jaringan dulu, cache bila offline/lambat
          urlPattern: ({ url }) => url.pathname.startsWith('/api/yt') && !url.search.includes('action=status'),
          handler: 'NetworkFirst',
          options: {
            cacheName: 'sb-api',
            networkTimeoutSeconds: 6,
            expiration: { maxEntries: 400, maxAgeSeconds: 7 * 24 * 3600, purgeOnQuotaError: true },
            cacheableResponse: { statuses: [200] },
          },
        },
        {
          // lirik jarang berubah
          urlPattern: /^https:\/\/lrclib\.net\/api\//,
          handler: 'CacheFirst',
          options: {
            cacheName: 'sb-lyrics',
            expiration: { maxEntries: 500, maxAgeSeconds: 60 * 24 * 3600, purgeOnQuotaError: true },
            cacheableResponse: { statuses: [200] },
          },
        },
        {
          // sampul album/artis
          urlPattern: /^https:\/\/([a-z0-9-]+\.)?(ytimg\.com|googleusercontent\.com|ggpht\.com)\//,
          handler: 'CacheFirst',
          options: {
            cacheName: 'sb-covers',
            expiration: { maxEntries: 600, maxAgeSeconds: 30 * 24 * 3600, purgeOnQuotaError: true },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
      ],
    },
    devOptions: { enabled: false },
  });

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const disablePwa = env.VITE_DISABLE_PWA === '1' || process.env.VITE_DISABLE_PWA === '1';
  const aliases: Record<string, string> = {};
  if (disablePwa) aliases['virtual:pwa-register'] = resolve(process.cwd(), 'src/lib/pwa-register-stub.ts');
  return {
    resolve: { alias: aliases },
    // PWA generation can fail on Android ARM due to Workbox/Terser worker limits.
    // Netlify keeps the normal PWA path; local phone builds can opt out explicitly.
    build: { minify: false },
    plugins: [react(), ytApi(env), ...(disablePwa ? [] : [pwa()])],
  };
});
