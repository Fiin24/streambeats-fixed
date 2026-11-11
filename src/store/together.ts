/**
 * Status "Dengar bersama": pengaturan (disimpan) + status sesi yang sedang berjalan.
 * Logika jaringan & sinkronisasi pemutar ada di src/lib/together.ts.
 * Sengaja TIDAK mengimpor store pemutar agar store/player.ts bisa membaca status tamu tanpa impor melingkar.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track } from '../lib/types';

export type TogetherStatus = 'idle' | 'connecting' | 'pending' | 'connected' | 'error';
export type TogetherRole = 'host' | 'guest' | null;

export interface TogetherMember { id: string; name: string; dev?: string; status?: 'pending' | 'approved'; online: boolean; joinedAt?: number }
export interface TogetherSuggestion { id: string; by: string; byName: string; track: Track; at: number }
export interface BlockedUser { name: string; dev?: string; at: number }
export interface TogetherLog { t: number; level: 'info' | 'warn' | 'error'; msg: string }
/** Sesi yang bisa dilanjutkan setelah aplikasi dibuka ulang */
export interface SavedSession { role: 'host' | 'guest'; code: string; key: string; memberId?: string; name: string; at: number }

/** Riwayat ruangan yang sudah selesai (bisa disimpan jadi playlist) */
export interface LastRoom { code: string; at: number; tracks: Track[] }

export interface ServerOption { id: string; label: string; url: string }
/** '' = server bawaan (situs Stream Beats ini, /api/together) */
export const DEFAULT_SERVERS: ServerOption[] = [{ id: 'default', label: 'Stream Beats — server bawaan', url: '' }];

interface TogetherState {
  // ── pengaturan (disimpan) ──
  username: string;
  serverUrl: string;
  autoApproveJoin: boolean;
  autoApproveSuggest: boolean;
  /** tampilkan room yang sedang di-host ke pengguna yang mengikuti kita */
  shareRoom: boolean;
  syncVolume: boolean;
  blocked: BlockedUser[];
  /** ID acak perangkat ini — dipakai untuk blokir & bergabung ulang */
  deviceId: string;
  session: SavedSession | null;
  /** lagu yang sudah diputar di ruangan saat ini (terbaru di akhir) */
  roomHistory: Track[];
  lastRoom: LastRoom | null;

  // ── status sesi (tidak disimpan) ──
  status: TogetherStatus;
  role: TogetherRole;
  code: string;
  hostName: string;
  members: TogetherMember[];
  suggestions: TogetherSuggestion[];
  /** antrean berikutnya milik host (dibagikan ke semua tamu) */
  queue: Track[];
  error: string | null;
  /** host tidak mengirim kabar > 20 dtk */
  hostStale: boolean;
  /** tamu menjeda sendiri → sinkronisasi pemutaran ditahan sampai tamu menekan putar */
  localHold: boolean;
  /** ping terakhir ke server (ms) */
  rtt: number | null;
  logs: TogetherLog[];
  /** percobaan terakhir (untuk tombol Reconnect bila gagal) */
  retry: { name: string; code: string; me: string } | null;

  set: (p: Partial<TogetherState>) => void;
  log: (msg: string, level?: TogetherLog['level']) => void;
  clearLogs: () => void;
  block: (u: { name: string; dev?: string }) => void;
  unblock: (i: number) => void;
}

const newDeviceId = () => {
  try { return crypto.randomUUID().replace(/-/g, '').slice(0, 20); } catch { return Math.random().toString(36).slice(2, 14) + Date.now().toString(36); }
};

export const useTogether = create<TogetherState>()(
  persist(
    (set, get) => ({
      username: '',
      serverUrl: '',
      autoApproveJoin: false,
      autoApproveSuggest: false,
      shareRoom: true,
      syncVolume: true,
      blocked: [],
      deviceId: newDeviceId(),
      session: null,
      roomHistory: [],
      lastRoom: null,

      status: 'idle',
      role: null,
      code: '',
      hostName: '',
      members: [],
      suggestions: [],
      queue: [],
      error: null,
      hostStale: false,
      localHold: false,
      rtt: null,
      logs: [],
      retry: null,

      set: (p) => set(p),
      log: (msg, level = 'info') => {
        if (level !== 'info') console.warn('[dengar-bersama]', msg);
        set((s) => ({ logs: [...s.logs, { t: Date.now(), level, msg }].slice(-300) }));
      },
      clearLogs: () => set({ logs: [] }),
      block: (u) => {
        const name = u.name.trim();
        if (!name) return;
        const exists = get().blocked.some((b) => (u.dev && b.dev === u.dev) || b.name.toLowerCase() === name.toLowerCase());
        if (!exists) set((s) => ({ blocked: [...s.blocked, { name, dev: u.dev, at: Date.now() }] }));
      },
      unblock: (i) => set((s) => ({ blocked: s.blocked.filter((_, k) => k !== i) })),
    }),
    {
      name: 'sb-together',
      partialize: (s) => ({
        username: s.username, serverUrl: s.serverUrl, autoApproveJoin: s.autoApproveJoin, autoApproveSuggest: s.autoApproveSuggest, shareRoom: s.shareRoom,
        syncVolume: s.syncVolume, blocked: s.blocked, deviceId: s.deviceId, session: s.session,
        roomHistory: s.roomHistory, lastRoom: s.lastRoom,
      }),
    },
  ),
);

/** true bila perangkat ini sedang menjadi tamu yang mengikuti host */
export const isGuestSync = () => {
  const s = useTogether.getState();
  return s.role === 'guest' && (s.status === 'connected' || s.status === 'pending');
};

/** Diisi src/lib/together.ts — dipanggil store pemutar saat tamu memilih lagu (lagu disarankan ke host) */
export const togetherHooks: { suggest: ((t: Track) => void) | null; toggle: (() => void) | null } = { suggest: null, toggle: null };
