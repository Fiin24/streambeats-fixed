import { useEffect } from 'react';
import { create } from 'zustand';
import { Capacitor, registerPlugin } from '@capacitor/core';

interface BackHandlerPlugin {
  registerHandler(): Promise<{ registered: boolean }>;
  unregisterHandler(): Promise<{ unregistered: boolean }>;
}
const BackHandler = registerPlugin<BackHandlerPlugin>('BackHandler');

declare global {
  interface Window {
    __backHandler?: () => boolean;
  }
}

/** React hook untuk mendaftarkan handler tombol back */
export function useBackHandler(handler: () => boolean) {
  useEffect(() => {
    window.__backHandler = handler;
    BackHandler.registerHandler().catch(() => {});
    return () => {
      window.__backHandler = undefined;
      BackHandler.unregisterHandler().catch(() => {});
    };
  }, [handler]);
}

import { registerSW } from 'virtual:pwa-register';
import { toast } from './toast';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  /** Event instal dari Chrome/Edge/Android (null bila belum tersedia / sudah terpasang) */
  installEvt: BeforeInstallPromptEvent | null;
  installed: boolean;
  offline: boolean;
  needRefresh: boolean;
  update: () => void;
}

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
export const isIOS = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let updateSW: ((reload?: boolean) => Promise<void>) | undefined;
let reloading = false;

/** muat ulang ke versi baru — langsung bila musik tidak diputar, selain itu tampilkan "Versi baru tersedia" */
async function applyUpdate(force = false) {
  if (reloading) return;
  if (!force) {
    try {
      const { usePlayer } = await import('../store/player');
      if (usePlayer.getState().playing) { usePwa.setState({ needRefresh: true }); return; }
    } catch { /* lanjut muat ulang */ }
  }
  reloading = true;
  window.location.reload();
}

export const usePwa = create<PwaState>(() => ({
  installEvt: null,
  installed: typeof window !== 'undefined' && isStandalone(),
  offline: typeof navigator !== 'undefined' && !navigator.onLine,
  needRefresh: false,
  update: () => {
    // service worker baru biasanya sudah aktif (skipWaiting) → cukup muat ulang
    void updateSW?.(true).catch(() => {});
    setTimeout(() => void applyUpdate(true), 600);
  },
}));

/** Tampilkan dialog instal bawaan browser */
export async function promptInstall(): Promise<boolean> {
  const e = usePwa.getState().installEvt;
  if (!e) return false;
  await e.prompt();
  const { outcome } = await e.userChoice;
  usePwa.setState({ installEvt: null });
  return outcome === 'accepted';
}

/** Hapus cache runtime (data, lirik, sampul) — app shell tetap tersimpan */
export async function clearOfflineCache() {
  if (!('caches' in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith('sb-')).map((k) => caches.delete(k)));
}

export async function storageUsed(): Promise<number | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e?.usage ?? null;
  } catch {
    return null;
  }
}

let started = false;
export function initPwa() {
  if (started) return;
  started = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // tampilkan tombol instal kita sendiri
    usePwa.setState({ installEvt: e as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => {
    usePwa.setState({ installEvt: null, installed: true });
    toast('Stream Beats terpasang di perangkatmu');
  });
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', (e) => usePwa.setState({ installed: e.matches }));
  window.addEventListener('online', () => { usePwa.setState({ offline: false }); toast('Kembali online'); });
  window.addEventListener('offline', () => usePwa.setState({ offline: true }));

  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  // versi baru mengambil alih halaman ini → muat ulang agar tampilan & kode ikut baru
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) void applyUpdate(); });
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh: () => void applyUpdate(),
    onOfflineReady: () => toast('Siap dipakai offline'),
    onRegisteredSW: (_url, reg) => {
      if (!reg) return;
      // cek versi baru tiap 30 menit dan setiap kali aplikasi dibuka lagi dari latar belakang
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    },
  });
}
