import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { markRemoved } from './syncMeta';

export interface FollowedArtist { id: string; name: string; thumbnail: string; at: number }

interface FollowState {
  artists: FollowedArtist[];
  toggle: (a: Omit<FollowedArtist, 'at'>) => boolean;
}

/** Artis yang diikuti (seperti tombol "Ikuti" di Spotify) — ikut tersinkron ke akun */
export const useFollows = create<FollowState>()(
  persist(
    (set, get) => ({
      artists: [],
      toggle: (a) => {
        const on = get().artists.some((x) => x.id === a.id);
        if (on) markRemoved(`fol:${a.id}`);
        set((s) => ({ artists: on ? s.artists.filter((x) => x.id !== a.id) : [{ ...a, at: Date.now() }, ...s.artists] }));
        return !on;
      },
    }),
    { name: 'sb-follows' },
  ),
);

export const useIsFollowing = (id?: string) => useFollows((s) => !!id && s.artists.some((a) => a.id === id));
