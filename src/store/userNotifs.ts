import { create } from 'zustand';
/** Notifikasi sosial: "X mulai mengikutimu" + tombol Ikuti balik. Diperiksa tiap 60 dtk saat login. */
import { authApi, type OtherUser } from '../lib/authApi';
import { useAuth } from './auth';
import { followUser } from '../lib/social';
import { toast } from '../lib/toast';

export interface FollowNotif { id: string; type: 'follow'; at: number; read: boolean; user: OtherUser; followingBack: boolean }

interface S {
  items: FollowNotif[];
  check: () => Promise<void>;
  markRead: (id?: string) => void;
  followBack: (n: FollowNotif) => Promise<void>;
}
const token = () => useAuth.getState().token;
let seen = new Set<string>();
let first = true;

export const useUserNotifs = create<S>((set, get) => ({
  items: [],
  check: async () => {
    const tk = token();
    if (!tk) { set({ items: [] }); return; }
    try {
      const { items } = await authApi<{ items: FollowNotif[] }>('notifications', {}, tk);
      const fresh = items.filter((n) => !n.read && !seen.has(n.id));
      items.forEach((n) => seen.add(n.id));
      set({ items });
      if (!first && fresh.length) {
        toast(fresh.length === 1 ? `👤 ${fresh[0].user.name || '@' + fresh[0].user.username} mulai mengikutimu` : `👤 ${fresh.length} pengikut baru`);
      }
      first = false;
    } catch { /* offline / belum login */ }
  },
  markRead: (id) => {
    const ids = id ? [id] : get().items.filter((n) => !n.read).map((n) => n.id);
    if (!ids.length) return;
    set((s) => ({ items: s.items.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)) }));
    void authApi('notifications-read', { ids }, token()).catch(() => {});
  },
  followBack: async (n) => {
    try {
      const r = await followUser(n.user.username);
      set((s) => ({ items: s.items.map((x) => (x.user.username === n.user.username ? { ...x, followingBack: r.following, read: true } : x)) }));
      get().markRead(n.id);
      toast(r.following ? `Mengikuti @${n.user.username}` : `Berhenti mengikuti @${n.user.username}`);
    } catch (e: any) { toast(e?.message || 'Gagal'); }
  },
}));

export const useUnreadFollows = () => useUserNotifs((s) => s.items.filter((n) => !n.read).length);

let timer: ReturnType<typeof setInterval> | null = null;
export function initUserNotifs() {
  if (timer) return;
  let lastTok = token();
  void useUserNotifs.getState().check();
  useAuth.subscribe((a) => {
    if (a.token !== lastTok) { lastTok = a.token; seen = new Set(); first = true; void useUserNotifs.getState().check(); }
  });
  timer = setInterval(() => { if (document.visibilityState === 'visible') void useUserNotifs.getState().check(); }, 60_000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void useUserNotifs.getState().check(); });
}
