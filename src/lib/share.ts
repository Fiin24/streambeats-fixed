import { create } from 'zustand';
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Track } from './types';
import { artistNames } from './format';
import { toast } from './toast';
import { isNativeApp } from './native';

/** Link lagu yang dibagikan: YouTube Music (bisa dibuka siapa saja, juga dari Stream Beats) */
export const trackUrl = (t: Track) => `https://music.youtube.com/watch?v=${t.videoId}`;

/** Tautan ke Stream Beats yang langsung membuka lagu (opsional di detik tertentu) — dipakai Dengar Bareng */
export function appTrackUrl(t: Track, at = 0): string {
  // APK tanpa server.url (aset lokal) → origin "https://localhost" tidak bisa dibuka orang lain
  if (isNativeApp() && /^(localhost|127\.)/.test(location.hostname)) return trackUrl(t);
  const u = new URL('/', location.origin);
  u.searchParams.set('play', t.videoId);
  if (at > 3) u.searchParams.set('t', String(Math.floor(at)));
  return u.toString();
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // WebView / browser lama: cara klasik
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** null = clipboard tidak bisa dibaca (izin ditolak / WebView lama) */
export async function readClipboard(): Promise<string | null> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

const songTitle = (t: Track) => [t.title, artistNames(t)].filter(Boolean).join(' — ');

/* ---------- lembar "Berbagi link" ---------- */

export interface SharePayload { url: string; title?: string; text?: string }

/** Lembar bagikan di dalam aplikasi — dipakai bila menu bagikan sistem tidak tersedia (desktop / APK lama) */
export const useShareSheet = create<{ data: SharePayload | null; close: () => void }>((set) => ({
  data: null,
  close: () => set({ data: null }),
}));

const NativeShare = registerPlugin<{ share(o: SharePayload): Promise<void>; shareImage(o: { data: string; name: string }): Promise<void> }>('NativeShare');
const nativeShareAvailable = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('NativeShare');
const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/**
 * Bagikan link:
 *  1. APK → lembar "Berbagi link" bawaan Android (plugin NativeShare)
 *  2. browser HP → navigator.share (lembar bagikan sistem yang sama)
 *  3. lainnya → lembar bagikan di dalam aplikasi (salin link + WhatsApp, Telegram, X, …)
 */
export async function shareLink(p: SharePayload) {
  if (nativeShareAvailable()) {
    try {
      await NativeShare.share(p);
      return;
    } catch { /* jatuh ke cara berikutnya */ }
  }
  if (navigator.share && isMobile()) {
    try {
      await navigator.share(p.text ? p : { url: p.url });
      return;
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
    }
  }
  useShareSheet.setState({ data: p });
}

/** Bagikan lagu: link YouTube Music, seperti "Berbagi link" di aplikasi musik lain */
export async function shareTrack(t: Track, opts: { at?: number; together?: boolean } = {}) {
  if (opts.together) {
    const title = songTitle(t);
    return shareLink({ url: appTrackUrl(t, opts.at || 0), title, text: `Dengar bareng aku di Stream Beats: ${title}` });
  }
  // hanya URL → Android menampilkan "Berbagi link" + pratinjau link + tombol salin
  return shareLink({ url: trackUrl(t), title: songTitle(t) });
}

/** "Dengar Bareng": undang teman memutar lagu yang sama dari posisi sekarang */
export function listenTogether(t: Track | null, at = 0) {
  if (!t) return toast('Putar lagu dulu, lalu ajak teman dengar bareng');
  return shareTrack(t, { at, together: true });
}

/** Bagikan gambar (mis. kartu lirik). Urutan: APK → menu bagikan sistem (file) → unduh PNG */
export async function shareImage(blob: Blob, name: string, title?: string): Promise<'shared' | 'saved'> {
  if (nativeShareAvailable()) {
    const data = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1] || '');
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
    try {
      await NativeShare.shareImage({ data, name });
      return 'shared';
    } catch { /* APK lama tanpa shareImage → unduh */ }
  }
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e: any) {
      if (e?.name === 'AbortError') return 'shared';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'saved';
}
