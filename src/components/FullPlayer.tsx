import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Mic2, ListMusic, Volume2, VolumeX, Share2 } from 'lucide-react';
import { usePlayer } from '../store/player';
import Cover from './Cover';
import LikeButton from './LikeButton';
import TrackMenu from './TrackMenu';
import QueueView from './QueueView';
import { Progress, Transport } from './Controls';
import { GlassLayers } from './Glass';
import { SleepTimerButton, SpeedButton, FocusButton } from './PlaybackMenus';
import { artistNames } from '../lib/format';
import { img } from '../lib/img';
import { useCoverColor } from '../lib/color';
import { useSwipe } from '../lib/gesture';
import { shareTrack } from '../lib/share';

export default function FullPlayer() {
  const { current, fullPlayer, fullTab, setFullPlayer, volume, muted, setVolume, toggleMute, error, next, prev } = usePlayer();
  const tint = useCoverColor(current?.thumbnail, current?.videoId);
  // Geser ke bawah = tutup, geser kiri/kanan pada cover = ganti lagu
  const close = useSwipe(['y'], (_a, d) => d > 120 && setFullPlayer(false));
  const cover = useSwipe(['x', 'y'], (a, d) => {
    if (a === 'y' && d > 120) setFullPlayer(false);
    if (a === 'x' && d < -80) next();
    if (a === 'x' && d > 80) prev();
  });
  useEffect(() => {
    if (!fullPlayer) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setFullPlayer(false);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [fullPlayer, setFullPlayer]);
  if (!fullPlayer || !current) return null;
  const v = muted ? 0 : volume;
  const sheetY = Math.max(0, close.dy || cover.dy);
  const dragging = close.dragging || cover.dragging;
  const glassPill = 'lg relative rounded-full';
  const tabBtn = (t: 'queue', Icon: typeof Mic2, label: string) => (
    <button
      onClick={() => setFullPlayer(true, fullTab === t ? null : t)}
      className={`${glassPill} flex items-center gap-2 px-4 py-2 text-sm font-semibold transition ${fullTab === t ? 'text-black' : ''}`}
    >
      {fullTab === t ? <span className="absolute inset-0 rounded-full bg-white -z-[1]" /> : <GlassLayers />}
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
  return (
    <div
      className="fixed inset-0 z-50 bg-black animate-slide-up overflow-hidden"
      style={{
        ['--tint' as any]: tint,
        transform: sheetY ? `translateY(${sheetY}px)` : undefined,
        transition: dragging ? 'none' : 'transform .3s cubic-bezier(.2,.8,.2,1)',
        borderRadius: sheetY ? 28 : 0,
      }}
    >
      {/* Latar dinamis: warna cover (ala Spotify) + cover buram */}
      <div className="absolute inset-0 transition-[background] duration-700" style={{ background: `linear-gradient(180deg, ${tint} 0%, color-mix(in srgb, ${tint} 35%, #000) 55%, #050505 100%)` }} />
      <img src={img(current.thumbnail, 400)} alt="" className="absolute inset-0 w-full h-full object-cover scale-125 blur-3xl opacity-40 mix-blend-soft-light" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black/85" />
      <div className="relative h-full flex flex-col px-6 pt-[max(env(safe-area-inset-top),16px)] pb-[max(env(safe-area-inset-bottom),20px)] max-w-6xl mx-auto">
        <div {...close.handlers} style={{ touchAction: 'none' }} className="flex items-center justify-between h-14 shrink-0">
          <button onClick={() => setFullPlayer(false)} aria-label="Tutup" className="p-2 -ml-2 rounded-full hover:bg-white/10"><ChevronDown className="w-7 h-7" /></button>
          <div className="text-center min-w-0 px-2">
            <span className="lg:hidden block mx-auto mb-1 w-9 h-1 rounded-full bg-white/40" />
            <p className="text-[11px] uppercase tracking-widest text-white/60">Sedang diputar</p>
            <p className="text-sm font-semibold truncate">{current.album?.name || 'Stream Beats'}</p>
          </div>
          <div className="flex items-center">
            <TrackMenu track={current} />
          </div>
        </div>
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-14 py-4">
          <div
            {...cover.handlers}
            style={{ touchAction: 'none' }}
            className={`flex-1 min-h-0 flex items-center justify-center select-none ${fullTab === 'queue' ? 'hidden lg:flex' : ''}`}
          >
            <div
              className="w-full max-w-[min(100%,52vh)] lg:max-w-[460px]"
              style={{
                transform: `translateX(${cover.dx}px) rotate(${cover.dx / 40}deg)`,
                opacity: 1 - Math.min(0.5, Math.abs(cover.dx) / 400),
                transition: cover.dragging ? 'none' : 'transform .35s cubic-bezier(.2,.8,.2,1), opacity .35s',
              }}
            >
              <Cover key={current.videoId} src={current.thumbnail} size={1000} alt={current.title} rounded="rounded-2xl" className="w-full aspect-square shadow-[0_30px_80px_rgba(0,0,0,.6)] animate-fade-in" />
            </div>
          </div>
          {fullTab === 'queue' && (
            <div className="flex-1 min-h-0 overflow-y-auto lg:max-h-[70vh]">
              <QueueView />
            </div>
          )}
        </div>
        <div className="shrink-0 space-y-4 lg:max-w-3xl lg:mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold truncate">{current.title}</h2>
              <p className="text-white/70 truncate">
                {current.artists?.[0]?.id ? (
                  <Link to={`/artist/${current.artists[0].id}`} onClick={() => setFullPlayer(false)} className="hover:underline">{artistNames(current)}</Link>
                ) : artistNames(current)}
              </p>
            </div>
            <LikeButton track={current} size="w-7 h-7" />
          </div>
          <Progress />
          {error && <p className="text-xs text-brand text-center">{error}</p>}
          <div className="flex justify-center"><Transport size="lg" /></div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
              <button onClick={() => usePlayer.getState().setLyricsOpen(true)} className={`${glassPill} flex items-center gap-2 px-4 py-2 text-sm font-semibold`}>
                <GlassLayers />
                <Mic2 className="w-4 h-4" /> Lirik
              </button>
              {tabBtn('queue', ListMusic, 'Antrean')}
            </div>
            <div className="flex items-center gap-1.5">
              <div className={`${glassPill} flex items-center`}>
                <GlassLayers />
                <SpeedButton className="p-2.5" size="w-[18px] h-[18px]" />
                <SleepTimerButton className="p-2.5" size="w-[18px] h-[18px]" />
                <FocusButton className="p-2.5" size="w-[18px] h-[18px]" />
                <button onClick={() => shareTrack(current)} aria-label="Bagikan" className="p-2.5 rounded-full text-zinc-300 hover:text-white"><Share2 className="w-[18px] h-[18px]" /></button>
              </div>
              <div className="hidden sm:flex items-center gap-2 ml-2">
                <button onClick={toggleMute} aria-label="Bisukan">{v === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}</button>
                <input type="range" className="range w-28" min={0} max={1} step={0.01} value={v} style={{ ['--p' as any]: `${v * 100}%` }} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Volume" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
