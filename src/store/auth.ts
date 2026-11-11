import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi, AuthError, type AuthStatus, type PublicUser } from '../lib/authApi';
import { useTaste } from './taste';

/**
 * Akun: daftar biasa (nama, username & password — tanpa kode verifikasi), atau mode tamu (profil lokal "local")
 * bila server belum mengaktifkan fitur akun / AUTH_OPTIONAL=1 dan pengguna memilih "Lanjut tanpa akun".
 */
export interface AppUser {
  uid: string;
  name: string;
  username?: string;
  email?: string;
  color?: string;
  createdAt?: number;
  avatar?: string | null;
  isPublic?: boolean;
  /** false = akun Google tanpa password */
  hasPassword?: boolean;
  google?: boolean;
}

/** Akun yang pernah masuk di perangkat ini (untuk ganti akun tanpa mengetik password lagi) */
export interface SavedAccount { token: string; user: AppUser; lastUsed: number }

interface AuthState {
  user: AppUser;
  token: string | null;
  accounts: SavedAccount[];
  /** status fitur akun dari server (disimpan agar aplikasi tetap bisa dibuka saat offline) */
  status: AuthStatus | null;
  /** pengguna memilih lanjut tanpa akun (hanya bila server mengizinkan) */
  guest: boolean;
  ready: boolean;
  init: () => Promise<void>;
  setSession: (token: string, user: PublicUser) => void;
  setUser: (user: PublicUser) => void;
  continueAsGuest: () => void;
  /** tampilkan layar masuk/daftar lagi (dari mode tamu) */
  showAuth: () => void;
  clearSession: () => void;
  /** pakai sesi akun tersimpan lain (data pustaka diatur oleh switchAccount di lib/sync) */
  selectAccount: (uid: string) => boolean;
  /** lepas akun dari daftar akun tersimpan */
  forgetAccount: (uid: string) => void;
}

export const LOCAL_USER: AppUser = { uid: 'local', name: 'Kamu' };

const toApp = (u: PublicUser): AppUser => ({
  uid: u.uid, name: u.name, username: u.username || undefined, email: u.email || undefined, color: u.color, createdAt: u.createdAt,
  avatar: u.avatar ?? null, isPublic: u.isPublic !== false, hasPassword: u.hasPassword !== false, google: !!u.google,
});

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: LOCAL_USER,
      token: null,
      accounts: [],
      status: null,
      guest: false,
      ready: false,
      init: async () => {
        const s = get();
        // Buka aplikasi sebagai tamu secara default. User bisa login/register dari dalam aplikasi.
        // Sesi akun tersimpan tetap dipakai dan tidak ditimpa.
        if (!s.token && !s.guest) set({ guest: true, user: LOCAL_USER });
        // sudah punya sesi / status tersimpan → langsung siap, cek ulang di latar belakang
        if (s.token || s.status) set({ ready: true });
        try {
          const st = await authApi<AuthStatus>('status', undefined, null, 6000);
          // Mode tamu jadi jalur masuk default. User bisa buka layar login dari profil/settings.
          // Token tetap diprioritaskan bila sesi akun sudah tersimpan.
          set({
            status: { enabled: st.enabled, required: st.required, dev: st.dev, maxAttempts: st.maxAttempts, lockMinutes: st.lockMinutes, google: !!st.google },
            ...(get().token ? {} : { guest: true, user: LOCAL_USER }),
          });
        } catch {
          /* offline: pakai status tersimpan */
        }
        set({ ready: true });
        const tok = get().token;
        if (tok) {
          try {
            const r = await authApi<{ user: PublicUser }>('me', undefined, tok, 10000);
            get().setUser(r.user);
          } catch (e) {
            if (e instanceof AuthError && e.status === 401) {
              get().clearSession();
              (await import('../lib/toast')).toast('Sesi berakhir, silakan masuk lagi');
            }
          }
        }
      },
      setSession: (token, u) => {
        const user = toApp(u);
        // bawa pilihan genre & artis dari mode tamu ke akun baru
        const taste = useTaste.getState();
        if (!taste.byUser[user.uid] && taste.byUser[LOCAL_USER.uid]?.done) {
          useTaste.setState({ byUser: { ...taste.byUser, [user.uid]: { ...taste.byUser[LOCAL_USER.uid] } } });
        }
        set((s) => ({
          token, user, guest: false,
          accounts: [{ token, user, lastUsed: Date.now() }, ...s.accounts.filter((a) => a.user.uid !== user.uid)].slice(0, 5),
        }));
      },
      setUser: (u) => set((s) => {
        const user = toApp(u);
        return { user, accounts: s.accounts.map((a) => (a.user.uid === user.uid ? { ...a, user } : a)) };
      }),
      continueAsGuest: () => set({ guest: true, user: LOCAL_USER, token: null }),
      showAuth: () => set({ guest: false }),
      clearSession: () => set((s) => ({ token: null, user: LOCAL_USER, guest: false, accounts: s.accounts.filter((a) => a.user.uid !== s.user.uid) })),
      selectAccount: (uid) => {
        const acc = get().accounts.find((a) => a.user.uid === uid);
        if (!acc) return false;
        set((s) => ({
          token: acc.token, user: acc.user, guest: false,
          accounts: s.accounts.map((a) => (a.user.uid === uid ? { ...a, lastUsed: Date.now() } : a)),
        }));
        return true;
      },
      forgetAccount: (uid) => set((s) => ({ accounts: s.accounts.filter((a) => a.user.uid !== uid) })),
    }),
    {
      name: 'sb-auth',
      partialize: (s) => ({ user: s.user, token: s.token, accounts: s.accounts, status: s.status, guest: s.guest }),
      // pengguna lama: masukkan sesi yang sedang aktif ke daftar akun tersimpan
      onRehydrateStorage: () => (st) => {
        if (st?.token && !st.accounts?.some((a) => a.user.uid === st.user.uid))
          useAuth.setState({ accounts: [{ token: st.token, user: st.user, lastUsed: Date.now() }, ...(st.accounts || [])] });
      },
    },
  ),
);

/** Perlu menampilkan layar masuk/daftar? */
export const needsAuth = (s: Pick<AuthState, 'token' | 'status' | 'guest'>) =>
  !s.token && !s.guest;

export const isSignedIn = () => !!useAuth.getState().token;
/** label akun untuk ditampilkan: @username (akun baru) atau email (akun lama) */
export const accountLabel = (u: Pick<AppUser, 'username' | 'email'>) => (u.username ? `@${u.username}` : u.email || '');
export const firstName = (n?: string) => (n || '').trim().split(/\s+/)[0] || '';
