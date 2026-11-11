/** Klien /api/auth — semua request JSON, error dilempar dengan pesan berbahasa Indonesia */
export class AuthError extends Error {
  constructor(message: string, public status: number, public data: Record<string, any> = {}) { super(message); }
}

export interface AuthStatus { enabled: boolean; required: boolean; dev: boolean; maxAttempts?: number; lockMinutes?: number; missing?: string[]; /** tombol "Lanjutkan dengan Google" aktif */ google?: boolean }
/** username = akun baru (v3.7+); email hanya ada pada akun lama v3.6 */
export interface PublicUser {
  uid: string; username: string | null; email: string | null; name: string; color: string; createdAt: number;
  /** URL foto profil (null = pakai huruf depan + warna) */
  avatar: string | null;
  /** profil & playlist bisa dilihat pengguna lain */
  isPublic: boolean;
  /** false = akun Google yang belum membuat password */
  hasPassword?: boolean;
  /** akun terhubung ke Google */
  google?: boolean;
}
/** pengguna lain (hasil pencarian / profil publik) */
export interface OtherUser { username: string; name: string; color: string; avatar: string | null; createdAt: number; isPublic: boolean; me?: boolean }
export interface PlaylistSummary { id: string; name: string; description: string; count: number; updatedAt: number; covers: string[] }
export interface Session { ok: true; token: string; user: PublicUser; /** true = akun baru dibuat (login Google) */ created?: boolean }

export async function authApi<T = any>(action: string, body?: unknown, token?: string | null, timeoutMs = 20000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`/api/auth?action=${encodeURIComponent(action)}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctl.signal,
      cache: 'no-store',
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new AuthError(j.error || `Gagal (${r.status})`, r.status, j);
    return j as T;
  } catch (e: any) {
    if (e instanceof AuthError) throw e;
    throw new AuthError(e?.name === 'AbortError' ? 'Server tidak merespons. Periksa koneksi lalu coba lagi.' : 'Tidak ada koneksi internet', 0);
  } finally {
    clearTimeout(t);
  }
}
