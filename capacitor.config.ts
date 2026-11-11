import type { CapacitorConfig } from '@capacitor/cli';
import { existsSync, readFileSync } from 'node:fs';

/** Baca CAP_SERVER_URL dari environment atau file .env */
function fromEnvFile(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  for (const f of ['.env.local', '.env']) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, 'utf8').match(new RegExp(`^\\s*${name}\\s*=\\s*(.+)\\s*$`, 'm'));
    if (m) return m[1].trim().replace(/^['"]|['"]$/g, '');
  }
  return undefined;
}

const serverUrl = fromEnvFile('CAP_SERVER_URL') || 'https://streambeast.netlify.app';

const config: CapacitorConfig = {
  appId: 'com.musickuzyy.streambeats',
  appName: 'Stream Beats',
  webDir: 'dist',
  // APK memuat situs yang sudah di-deploy (butuh fungsi /api/yt di server).
  server: serverUrl ? { url: serverUrl, cleartext: false, androidScheme: 'https' } : { androidScheme: 'https' },
  android: {
    // musik tetap jalan walau WebView tidak terlihat
    allowMixedContent: false,
  },
};

export default config;
