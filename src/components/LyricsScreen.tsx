import { useEffect, useState } from 'react';
import { ChevronDown, Share2 } from 'lucide-react';
import { usePlayer } from '../store/player';
import Cover from './Cover';
import LikeButton from './LikeButton';
import LyricsView from './LyricsView';
import { Progress, Transport } from './Controls';
import { GlassLayers } from './Glass';
import { artistNames } from '../lib/format';
import { useCoverColor } from '../lib/color';
import LyricsShare from './LyricsShare';

/** Layar lirik penuh ala Spotify: latar warna cover, baris besar & tebal, ketuk baris untuk lompat */
export default function LyricsScreen() {
  const current = usePlayer((s) => s.current);
  const open = usePlayer((s) => s.lyricsOpen);
  const setLyricsOpen = usePlayer((s) => s.setLyricsOpen);
  const [sharing, setSharing] = useState(false);
  const tint = useCoverColor(current?.thumbnail, current?.videoId);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setLyricsOpen(false);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, setLyricsOpen]);
  if (!open || !current) return null;
  return (
    <div
      className="fixed inset-0 z-[55] lg:z-[38] animate-slide-up overflow-hidden"
      style={{ ['--tint' as any]: tint, background: `linear-gradient(180deg, ${tint}, color-mix(in srgb, ${tint} 78%, #000))` }}
    >
      <div className="h-full max-w-4xl mx-auto flex flex-col px-6 lg:px-10">
        {/* header kaca */}
        <div className="pt-[max(env(safe-area-inset-top),12px)] lg:pt-4 shrink-0">
          <div className="lg relative rounded-[22px] flex items-center gap-3 p-2 pr-3">
            <GlassLayers />
            <button onClick={() => setLyricsOpen(false)} aria-label="Tutup lirik" className="p-2 rounded-full hover:bg-white/10"><ChevronDown className="w-6 h-6" /></button>
            <Cover src={current.thumbnail} size={120} className="w-10 h-10 shrink-0" rounded="rounded-lg" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate">{current.title}</p>
              <p className="text-xs text-white/70 truncate">{artistNames(current)}</p>
            </div>
            <button onClick={() => setSharing(true)} aria-label="Bagikan lirik" title="Bagikan lirik sebagai gambar" data-testid="lyrics-share" className="p-2 rounded-full hover:bg-white/10"><Share2 className="w-5 h-5" /></button>
            <LikeButton track={current} size="w-5 h-5" className="p-2" />
          </div>
        </div>
        <div className="flex-1 min-h-0 [mask-image:linear-gradient(transparent,#000_12%,#000_85%,transparent)]">
          <LyricsView screen />
        </div>
        {/* kontrol kaca (mobile); di desktop player bar melayang tetap terlihat */}
        <div className="lg:hidden shrink-0 pb-[max(env(safe-area-inset-bottom),14px)]">
          <div className="lg relative rounded-[26px] px-4 pt-3 pb-2 space-y-1">
            <GlassLayers />
            <Progress />
            <div className="flex justify-center"><Transport /></div>
          </div>
        </div>
        <div className="hidden lg:block h-[104px] shrink-0" />
      </div>
      {sharing && (
        <LyricsShare track={current} tint={tint} duration={usePlayer.getState().duration || undefined} start={usePlayer.getState().time} onClose={() => setSharing(false)} />
      )}
    </div>
  );
}
