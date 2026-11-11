import { useSettings } from '../store/settings';

type Conn = { type?: string; effectiveType?: string; saveData?: boolean; addEventListener?: (e: string, f: () => void) => void };
const conn = (): Conn | undefined => (navigator as any).connection;

/** true bila perangkat sedang memakai data seluler / koneksi lambat (sejauh browser memberi tahu) */
export function onMeteredNetwork(): boolean {
  const c = conn();
  if (!c) return false;
  if (c.saveData) return true;
  if (c.type) return c.type === 'cellular';
  return c.effectiveType === '2g' || c.effectiveType === 'slow-2g' || c.effectiveType === '3g';
}

/** Mode hemat data sedang berlaku sekarang? */
export function savingData(): boolean {
  const m = useSettings.getState().dataSaver;
  return m === 'always' || (m === 'cellular' && onMeteredNetwork());
}

/** Bisa mendeteksi jenis jaringan (Wi-Fi vs seluler) di perangkat ini? */
export const networkTypeKnown = () => !!conn()?.type;
