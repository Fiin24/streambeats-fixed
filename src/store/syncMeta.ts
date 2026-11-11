import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Metadata sinkronisasi: penanda hapus (tombstone) agar lagu/playlist/artis yang dihapus
 * di satu perangkat tidak muncul lagi saat digabung dengan data perangkat lain.
 */
interface SyncMeta {
  tomb: Record<string, number>;
  /** versi data server yang terakhir dilihat perangkat ini */
  base: number;
  lastSyncAt: number;
  dirty: boolean;
  /** uid pemilik data lokal saat ini */
  owner: string | null;
}

export const useSyncMeta = create<SyncMeta>()(
  persist(() => ({ tomb: {}, base: 0, lastSyncAt: 0, dirty: false, owner: null }) as SyncMeta, { name: 'sb-sync' }),
);

export const markRemoved = (key: string) => useSyncMeta.setState((s) => ({ tomb: { ...s.tomb, [key]: Date.now() } }));
