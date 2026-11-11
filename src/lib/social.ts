import { create } from 'zustand';
/** Teman (pengguna yang diikuti), room yang sedang mereka buka, & playlist kolaboratif — butuh akun */
import { authApi } from './authApi';
import { useAuth } from '../store/auth';
import { useTogether } from '../store/together';
import { usePlayer } from '../store/player';
import type { OtherUser } from './authApi';
import type { Track } from './types';

const token = () => useAuth.getState().token;

export interface FriendRoom { code: string; hostName: string; track: string; listeners: number; at: number }
export interface Friend extends OtherUser { room: FriendRoom | null }
export interface CollabTrack extends Track { by: string; addedAt: number; mine?: boolean }
export interface CollabSummary { id: string; name: string; description: string; ownerName: string; owner: boolean; member: boolean; members: number; count: number; updatedAt: number; covers: string[] }
export interface CollabPlaylist extends CollabSummary { tracks: CollabTrack[] }

export const followUser = (username: string) => authApi<{ following: boolean }>('follow-user', { username }, token());
export const loadFriends = () => authApi<{ friends: Friend[] }>('friends', {}, token()).then((r) => r.friends);

export const collab = {
  list: () => authApi<{ playlists: CollabSummary[] }>('collab', { op: 'list' }, token()).then((r) => r.playlists),
  get: (id: string) => authApi<{ playlist: CollabPlaylist }>('collab', { op: 'get', id }, token()).then((r) => r.playlist),
  join: (id: string) => authApi<{ playlist: CollabPlaylist }>('collab', { op: 'join', id }, token()).then((r) => r.playlist),
  create: (name: string, description: string, tracks: Track[]) => authApi<{ playlist: CollabPlaylist }>('collab', { op: 'create', name, description, tracks }, token()).then((r) => r.playlist),
  add: (id: string, track: Track) => authApi<{ playlist: CollabPlaylist; dup?: boolean }>('collab', { op: 'add', id, track }, token()),
  remove: (id: string, videoId: string) => authApi<{ playlist: CollabPlaylist }>('collab', { op: 'remove', id, videoId }, token()).then((r) => r.playlist),
  leave: (id: string) => authApi<{ deleted?: boolean }>('collab', { op: 'leave', id }, token()),
};
export const collabLink = (id: string) => `${window.location.origin}/collab/${id}`;

/** Umumkan room yang sedang di-host ke pengikut (diperbarui tiap 60 dtk, kedaluwarsa sendiri di server) */
let presenceTimer: ReturnType<typeof setInterval> | null = null;
let announced = '';
function presenceTick() {
  const t = useTogether.getState();
  const tk = token();
  const on = !!tk && t.shareRoom && t.role === 'host' && t.status === 'connected' && !!t.code;
  if (!on) {
    if (announced && tk) void authApi('room-presence', { code: '' }, tk).catch(() => {});
    announced = '';
    return;
  }
  announced = t.code;
  const cur = usePlayer.getState().current;
  void authApi('room-presence', {
    code: t.code, hostName: t.hostName, track: cur ? `${cur.title}` : '', listeners: t.members.filter((m) => m.status === 'approved').length,
  }, tk).catch(() => {});
}
export function initRoomPresence() {
  if (presenceTimer) return;
  let last = '';
  useTogether.subscribe((t) => {
    const key = `${t.shareRoom}|${t.role}|${t.status}|${t.code}`;
    if (key !== last) { last = key; presenceTick(); }
  });
  presenceTimer = setInterval(presenceTick, 60_000);
}

/** daftar playlist kolaboratif (untuk Pustaka & menu "Tambahkan ke playlist") */
export const useCollabs = create<{ list: CollabSummary[]; loaded: boolean; load: () => Promise<void> }>((set) => ({
  list: [],
  loaded: false,
  load: async () => {
    if (!token()) return set({ list: [], loaded: true });
    try { set({ list: await collab.list(), loaded: true }); } catch { set({ loaded: true }); }
  },
}));
