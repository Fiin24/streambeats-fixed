import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { AuthError } from './authApi';

/**
 * "Lanjutkan dengan Google" (v4.3)
 * - Web/PWA : halaman pindah ke /api/auth?action=google-start → Google → /api/google-callback → kembali ke /?gauth=KODE
 * - APK     : Google tidak mengizinkan login di dalam WebView, jadi halaman Google dibuka di Chrome (Custom Tab)
 *             lewat plugin native "ExternalAuth", lalu kembali ke aplikasi lewat deep link
 *             com.musickuzyy.streambeats://auth?gauth=KODE
 * KODE adalah kode sekali pakai (3 menit) yang ditukar menjadi sesi lewat POST google-exchange.
 */
interface ExternalAuthPlugin {
  open(o: { url: string }): Promise<void>;
  addListener(event: 'result', cb: (d: { url: string }) => void): Promise<PluginListenerHandle>;
}
const ExternalAuth = registerPlugin<ExternalAuthPlugin>('ExternalAuth');

const isNative = () => Capacitor.isNativePlatform();
const nativeReady = () => isNative() && Capacitor.isPluginAvailable('ExternalAuth');

export type GoogleResult = { code: string } | { error: string };

function parse(params: URLSearchParams): GoogleResult | null {
  const code = params.get('gauth');
  const error = params.get('gauth_error');
  if (code) return { code };
  if (error) return { error };
  return null;
}

/** hasil login Google di URL halaman (web) — dibaca sekali lalu dihapus dari address bar */
export function takeGoogleResultFromUrl(): GoogleResult | null {
  const sp = new URLSearchParams(location.search);
  const res = parse(sp);
  if (!res) return null;
  sp.delete('gauth');
  sp.delete('gauth_error');
  history.replaceState(history.state, '', location.pathname + (sp.toString() ? `?${sp}` : '') + location.hash);
  return res;
}

/** APK: dengarkan hasil dari deep link (juga saat aplikasi dibuka ulang dari deep link) */
export function onNativeGoogleResult(cb: (r: GoogleResult) => void): () => void {
  if (!nativeReady()) return () => {};
  let handle: PluginListenerHandle | undefined;
  let gone = false;
  void ExternalAuth.addListener('result', (d) => {
    try {
      const r = parse(new URL(d.url).searchParams);
      if (r) cb(r);
    } catch { /* abaikan */ }
  }).then((h) => { if (gone) void h.remove(); else handle = h; });
  return () => { gone = true; void handle?.remove(); };
}

/** mulai login Google */
export async function startGoogleSignIn(): Promise<void> {
  if (!isNative()) {
    location.assign('/api/auth?action=google-start');
    return;
  }
  if (!nativeReady()) {
    throw new AuthError('Perbarui aplikasi Stream Beats (APK versi terbaru) untuk masuk dengan Google, atau buka lewat browser.', 0);
  }
  let url = '';
  try {
    const res = await fetch('/api/auth?action=google-start&app=1&format=json', { cache: 'no-store' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.url) throw new AuthError(j.error || `Gagal (${res.status})`, res.status, j);
    url = j.url;
  } catch (e: any) {
    throw e instanceof AuthError ? e : new AuthError('Tidak ada koneksi internet', 0);
  }
  await ExternalAuth.open({ url });
}
