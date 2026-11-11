import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PickedArtist { id: string; name: string; thumbnail: string }
export interface Taste { genres: string[]; artists: PickedArtist[]; done: boolean; updatedAt: number }

interface TasteState {
  /** selera per akun (uid) — disimpan di perangkat */
  byUser: Record<string, Taste>;
  save: (uid: string, t: Omit<Taste, 'updatedAt' | 'done'>) => void;
  /** buka lagi layar pilih genre & artis */
  reopen: (uid: string) => void;
}

export const useTaste = create<TasteState>()(
  persist(
    (set) => ({
      byUser: {},
      save: (uid, t) => set((s) => ({ byUser: { ...s.byUser, [uid]: { ...t, done: true, updatedAt: Date.now() } } })),
      reopen: (uid) =>
        set((s) => ({ byUser: { ...s.byUser, [uid]: { ...(s.byUser[uid] || { genres: [], artists: [], updatedAt: 0 }), done: false } } })),
    }),
    { name: 'sb-taste' },
  ),
);

export const tasteOf = (uid?: string | null) => (uid ? useTaste.getState().byUser[uid] : undefined);
