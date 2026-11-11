import { Link } from 'react-router-dom';
import { Mic2, PanelRight, ListMusic, Volume2, Volume1, VolumeX, Maximize2, Share2 } from 'lucide-react';
import { usePlayer } from '../store/player';
import Cover from './Cover';
import LikeButton from './LikeButton';
import { Progress, Transport } from './Controls';
import { GlassLayers } from './Glass';
import { SleepTimerButton, SpeedButton, FocusButton } from './PlaybackMenus';
import { artistNames } from '../lib/format';
import { useCoverColor } from '../lib/color';
import { shareTrack } from '../lib/share';

/** Player bar desktop — melayang di atas konten dengan efek liquid glass */
export default function PlayerBar() {
  const lyricsOpen = usePlayer((s) => s.lyricsOpen);
  const setLyricsOpen = usePlayer((s) => s.setLyricsOpen);
  const { current, rightPanel, setRightPanel, volume, muted, setVolume, toggleMute, setFullPlayer, error } = usePlayer();
  const tint = useCoverColor(current?.thumbnail, current?.videoId);
  if (!current) return null;
  const v = muted ? 0 : volume;
  const VolIcon = v === 0 ? VolumeX : v < 0.5 ? Volume1 : Volume2;
  const ib = (active: boolean) => `relative p-2 rounded-full transition ${active ? 'text-spotify' : 'text-zinc-300 hover:text-white hover:bg-white/10'}`;
  const dot = <span className="absolute left-1/2 -translate-x-1/2 bottom-0.5 w-1 h-1 rounded-full bg-spotify" />;
  return (
    <footer
      className="lg hidden lg:block fixed z-40 left-2 right-2 bottom-2 h-[84px] rounded-[24px] animate-slide-up"
      style={{ ['--tint' as any]: tint }}
    >
      <GlassLayers />
      <div className="h-full flex items-center px-3">
        <div className="w-[30%] min-w-[180px] flex items-center gap-3">
          <button onClick={() => setFullPlayer(true)} aria-label="Layar penuh" className="shrink-0 group relative">
            <Cover src={current.thumbnail} size={160} className="w-14 h-14 shadow-[0_6px_18px_rgba(0,0,0,.45)]" rounded="rounded-xl" />
            <span className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
              <Maximize2 className="w-4 h-4" />
            </span>
          </button>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate hover:underline cursor-pointer" onClick={() => setRightPanel('nowplaying')}>{current.title}</p>
            <p className="text-xs text-white/65 truncate">
              {current.artists?.[0]?.id ? <Link to={`/artist/${current.artists[0].id}`} className="hover:underline hover:text-white">{artistNames(current)}</Link> : artistNames(current)}
            </p>
          </div>
          <LikeButton track={current} className="ml-1" size="w-4 h-4" />
        </div>
        <div className="flex-1 max-w-[720px] mx-auto flex flex-col items-center gap-1">
          <Transport />
          <Progress />
          {error && <p className="text-[11px] text-brand -mt-1">{error}</p>}
        </div>
        <div className="w-[30%] min-w-[180px] flex items-center justify-end gap-0.5">
          <button onClick={() => setRightPanel('nowplaying')} aria-label="Tampilan sedang diputar" title="Tampilan sedang diputar" className={ib(rightPanel === 'nowplaying')}><PanelRight className="w-4 h-4" />{rightPanel === 'nowplaying' && dot}</button>
          <button onClick={() => setLyricsOpen(!lyricsOpen)} aria-label="Lirik" aria-pressed={lyricsOpen} title="Lirik (L)" className={ib(lyricsOpen)}><Mic2 className="w-4 h-4" />{lyricsOpen && dot}</button>
          <button onClick={() => setRightPanel('queue')} aria-label="Antrean" title="Antrean (Q)" className={ib(rightPanel === 'queue')}><ListMusic className="w-4 h-4" />{rightPanel === 'queue' && dot}</button>
          <SleepTimerButton className="p-2 hover:bg-white/10" />
          <SpeedButton className="p-2 hover:bg-white/10" />
          <FocusButton className="p-2 hover:bg-white/10" />
          <button onClick={() => shareTrack(current)} aria-label="Bagikan" title="Bagikan" className={`${ib(false)} hidden xl:block`}><Share2 className="w-4 h-4" /></button>
          <button onClick={toggleMute} aria-label="Bisukan" title="Bisukan (M)" className={ib(false)}><VolIcon className="w-4 h-4" /></button>
          <input
            type="range"
            className="range w-[90px]"
            min={0}
            max={1}
            step={0.01}
            value={v}
            style={{ ['--p' as any]: `${v * 100}%` }}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="Volume"
          />
          <button onClick={() => setFullPlayer(true)} aria-label="Layar penuh" title="Layar penuh (F)" className={ib(false)}><Maximize2 className="w-4 h-4" /></button>
        </div>
      </div>
    </footer>
  );
}
