import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Link2, Loader2, ImageDown } from 'lucide-react';
import type { Track } from '../lib/types';
import { fetchLyrics, type Lyrics } from '../lib/lyrics';
import { renderLyricCard } from '../lib/lyricCard';
import { shareImage, shareTrack } from '../lib/share';
import { toast } from '../lib/toast';
import { artistNames } from '../lib/format';
import Cover from './Cover';

const MAX = 5;

/** Pilih hingga 5 baris lirik → bagikan sebagai gambar */
export default function LyricsShare({ track, tint, duration, start, onClose }: {
  track: Track; tint: string; duration?: number; start: number; onClose: () => void;
}) {
  const [lyr, setLyr] = useState<Lyrics | null>(null);
  const [sel, setSel] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchLyrics(track, duration).then((l) => alive && setLyr(l));
    return () => { alive = false; };
  }, [track, duration]);
  const lines = useMemo(
    () => (lyr?.synced ? lyr.synced.map((l) => l.text) : (lyr?.plain || '').split('\n')).map((t) => t.trim()),
    [lyr],
  );
  // pilih otomatis baris yang sedang dinyanyikan
  useEffect(() => {
    if (!lyr?.synced || sel.length) return;
    let i = -1;
    lyr.synced.forEach((l, k) => { if (l.time <= start + 0.25) i = k; });
    if (i >= 0 && lines[i]) setSel([i]);
  }, [lyr]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (i: number) => setSel((s) => {
    if (s.includes(i)) return s.filter((x) => x !== i);
    if (s.length >= MAX) { toast(`Maksimal ${MAX} baris`); return s; }
    return [...s, i].sort((a, b) => a - b);
  });
  const chosen = sel.map((i) => lines[i]).filter(Boolean);
  const share = async () => {
    if (!chosen.length) return;
    setBusy(true);
    try {
      const blob = await renderLyricCard(track, chosen, tint);
      const r = await shareImage(blob, `lirik-${track.videoId}.png`, track.title);
      if (r === 'saved') toast('Gambar lirik disimpan');
      onClose();
    } catch (e: any) {
      toast(e?.message || 'Gagal membuat gambar');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-md max-h-[88dvh] flex flex-col bg-[#161616] sm:rounded-2xl rounded-t-2xl overflow-hidden animate-slide-up">
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-white/[.06]">
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Bagikan lirik</p>
            <p className="text-[13px] text-zinc-400">Pilih sampai {MAX} baris · {sel.length}/{MAX}</p>
          </div>
          <button onClick={onClose} aria-label="Tutup" className="p-2 -mr-2 rounded-full hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>
        {/* pratinjau kecil */}
        <div className="px-4 pt-4">
          <div className="rounded-xl p-4 min-h-[112px]" style={{ background: tint }}>
            <div className="flex items-center gap-2.5">
              <Cover src={track.thumbnail} size={96} className="w-8 h-8 shrink-0" rounded="rounded" />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold truncate">{track.title}</p>
                <p className="text-xs text-white/70 truncate">{artistNames(track)}</p>
              </div>
            </div>
            <p className="mt-3 font-extrabold text-lg leading-snug">
              {chosen.length ? chosen.map((l, i) => <span key={i} className="block">{l}</span>) : <span className="text-white/50">Ketuk baris di bawah</span>}
            </p>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-2 py-3">
          {!lyr ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>
          ) : !lines.some(Boolean) ? (
            <p className="text-center text-zinc-400 py-10 text-sm">Lirik tidak tersedia untuk lagu ini</p>
          ) : lines.map((l, i) => l && (
            <button key={i} onClick={() => toggle(i)} aria-pressed={sel.includes(i)}
              className={`block w-full text-left px-3 py-2 rounded-lg text-[15px] leading-snug transition ${sel.includes(i) ? 'bg-white text-black font-semibold' : 'text-zinc-300 hover:bg-white/[.06]'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-2 p-4 pt-3 border-t border-white/[.06] pb-[max(env(safe-area-inset-bottom),16px)]">
          <button onClick={() => { onClose(); void shareTrack(track); }} className="h-11 px-4 rounded-full bg-white/10 hover:bg-white/15 text-sm font-semibold flex items-center gap-2"><Link2 className="w-4 h-4" /> Link</button>
          <button onClick={() => void share()} disabled={!chosen.length || busy} data-testid="lyrics-share-image"
            className="flex-1 h-11 rounded-full bg-white text-black text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageDown className="w-4 h-4" />} Bagikan sebagai gambar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
