import { CircleArrowDown, Loader2, Clock } from 'lucide-react';
import type { Track } from '../lib/types';
import { useShallow } from 'zustand/react/shallow';
import { useDownloads } from '../store/downloads';
import { toast } from '../lib/toast';

/** Ikon kecil di baris lagu: hijau = sudah diunduh, cincin = sedang diunduh */
export function DlBadge({ videoId, className = '' }: { videoId: string; className?: string }) {
  const st = useDownloads((s) => (s.items[videoId] ? 'done' : s.active[videoId] != null ? s.active[videoId] : s.pending.some((p) => p.videoId === videoId) ? 'wait' : null));
  if (st == null) return null;
  if (st === 'done') return <CircleArrowDown aria-label="Sudah diunduh" className={`inline w-3.5 h-3.5 mr-1 -mt-0.5 text-spotify fill-spotify/20 ${className}`} />;
  if (st === 'wait') return <Clock aria-label="Menunggu diunduh" className={`inline w-3.5 h-3.5 mr-1 -mt-0.5 text-zinc-400 ${className}`} />;
  return <ProgressRing value={st as number} className={`inline-block mr-1 -mt-0.5 align-middle ${className}`} />;
}

export function ProgressRing({ value, size = 14, className = '' }: { value: number; size?: number; className?: string }) {
  const r = size / 2 - 1.5, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={`-rotate-90 ${className}`} aria-label={`Mengunduh ${Math.round(value * 100)}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={2} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#FA243C" strokeWidth={2} strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0.04, value))} strokeLinecap="round" />
    </svg>
  );
}

/** Tombol "Unduh semua" untuk playlist / album / Lagu Disukai (seperti Spotify) */
export function CollectionDownload({ tracks, className = '' }: { tracks: Track[]; className?: string }) {
  const ids = tracks.map((t) => t.videoId);
  // useShallow: selector mengembalikan objek baru → wajib dibandingkan dangkal (zustand v5)
  const { done, busy } = useDownloads(useShallow((s) => {
    let done = 0, busy = 0;
    const pend = new Set(s.pending.map((p) => p.videoId));
    for (const id of ids) {
      if (s.items[id]) done++;
      else if (s.active[id] != null || pend.has(id)) busy++;
    }
    return { done, busy };
  }));
  const total = ids.length;
  if (!total) return null;
  const all = done === total;
  const click = () => {
    const s = useDownloads.getState();
    if (all) {
      if (confirm(`Hapus ${total} lagu ini dari unduhan? Lagu tidak akan bisa diputar offline.`)) s.removeMany(ids).then(() => toast('Unduhan dihapus'));
      return;
    }
    if (busy) {
      for (const id of ids) if (!s.items[id]) s.cancel(id);
      toast('Unduhan dibatalkan');
      return;
    }
    const n = s.enqueue(tracks);
    toast(n ? `Mengunduh ${n} lagu untuk diputar offline…` : 'Semua lagu sudah diunduh');
  };
  return (
    <button
      onClick={click}
      aria-label={all ? 'Hapus unduhan' : busy ? 'Batalkan unduhan' : 'Unduh'}
      title={all ? 'Sudah diunduh — ketuk untuk menghapus' : busy ? 'Sedang mengunduh — ketuk untuk membatalkan' : 'Unduh untuk diputar offline'}
      className={`flex items-center gap-2 p-2 text-zinc-300 hover:text-white ${className}`}
    >
      {busy ? (
        <span className="relative w-7 h-7 flex items-center justify-center">
          <ProgressRing value={done / total} size={28} />
          <Loader2 className="absolute w-3.5 h-3.5 animate-spin text-zinc-300" />
        </span>
      ) : (
        <CircleArrowDown className={`w-7 h-7 ${all ? 'text-spotify fill-spotify/20' : ''}`} />
      )}
      {(busy > 0 || (done > 0 && !all)) && <span className="text-xs tabular-nums text-zinc-400">{done}/{total}</span>}
    </button>
  );
}
