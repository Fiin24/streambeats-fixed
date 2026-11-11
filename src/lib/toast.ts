import { create } from 'zustand';

interface ToastState { msg: string | null; id: number; show: (msg: string) => void }
export const useToast = create<ToastState>((set) => ({
  msg: null,
  id: 0,
  show: (msg) => {
    const id = Date.now();
    set({ msg, id });
    setTimeout(() => set((s) => (s.id === id ? { msg: null } : s)), 2600);
  },
}));
export const toast = (msg: string) => useToast.getState().show(msg);
