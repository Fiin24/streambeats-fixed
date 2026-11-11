import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Moon, Gauge, Check, Brain } from 'lucide-react';
import { usePlayer } from '../store/player';
import { toast } from '../lib/toast';
import { GlassLayers } from './Glass';

/** Menu pop-up berlapis kaca, menempel di atas/bawah tombol pemicu */
function GlassPopover({ anchor, onClose, width = 232, children }: {
  anchor: HTMLElement; onClose: () => void; width?: number; children: React.ReactNode;
}) {
  const r = anchor.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 8));
  const above = r.top > window.innerHeight / 2;
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    window.addEventListener('resize', onClose);
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('resize', onClose); };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[70]" onClick={onClose}>
      <div
        role="menu"
        onClick={(e) => e.stopPropagation()}
        style={{ left, width, ...(above ? { bottom: window.innerHeight - r.top + 10 } : { top: r.bottom + 10 }) }}
        className="lg lg-dark absolute rounded-2xl p-1.5 animate-fade-in"
      >
        <GlassLayers />
        {children}
      </div>
    </div>,
    document.body,
  );
}

function MenuItem({ active, label, hint, onClick }: { active?: boolean; label: string; hint?: string; onClick: () => void }) {
  return (
    <button role="menuitemradio" aria-checked={!!active} onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left rounded-xl hover:bg-white/10 ${active ? 'text-spotify' : ''}`}>
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="text-xs text-white/50">{hint}</span>}
      {active && <Check className="w-4 h-4 shrink-0" />}
    </button>
  );
}

function useNow(active: boolean, key: unknown) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active, key]);
  return now;
}

export function sleepLabel(sleepAt: number | null, sleepEnd: boolean, now: number, songs = 0): string | null {
  if (sleepEnd || songs === 1) return 'Akhir lagu';
  if (songs > 1) return `${songs} lagu`;
  if (!sleepAt) return null;
  const s = Math.max(0, Math.round((sleepAt - now) / 1000));
  return s >= 60 ? `${Math.ceil(s / 60)} mnt` : `${s} dtk`;
}

const SLEEP_OPTS = [5, 10, 15, 30, 45, 60, 90];
const SLEEP_SONGS = [2, 3, 5, 10];

export function SleepTimerButton({ className = '', size = 'w-4 h-4', showLabel = false }: { className?: string; size?: string; showLabel?: boolean }) {
  const sleepAt = usePlayer((s) => s.sleepAt);
  const sleepEnd = usePlayer((s) => s.sleepEnd);
  const sleepSongs = usePlayer((s) => s.sleepSongs);
  const setSleep = usePlayer((s) => s.setSleep);
  const setSleepSongs = usePlayer((s) => s.setSleepSongs);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const active = !!sleepAt || sleepEnd || sleepSongs > 0;
  const now = useNow(active, sleepAt);
  const label = sleepLabel(sleepAt, sleepEnd, now, sleepSongs);
  const pickSongs = (n: number) => {
    setSleepSongs(n);
    setOpen(false);
    toast(`Musik berhenti setelah ${n} lagu`);
  };
  const pick = (m: number | 'end' | null) => {
    setSleep(m);
    setOpen(false);
    toast(m === null ? 'Timer tidur dimatikan' : m === 'end' ? 'Musik berhenti di akhir lagu ini' : `Timer tidur: ${m} menit`);
  };
  return (
    <>
      <button ref={btn} onClick={() => setOpen((o) => !o)} aria-label="Timer tidur" title={label ? `Timer tidur • ${label}` : 'Timer tidur'}
        className={`relative flex items-center gap-1.5 rounded-full transition ${active ? 'text-spotify' : 'text-zinc-300 hover:text-white'} ${className}`}>
        <Moon className={`${size} ${active ? 'fill-current' : ''}`} />
        {showLabel && <span className="text-sm font-semibold">{label || 'Timer'}</span>}
        {!showLabel && active && <span className="absolute left-1/2 -translate-x-1/2 bottom-0 w-1 h-1 rounded-full bg-spotify" />}
      </button>
      {open && btn.current && (
        <GlassPopover anchor={btn.current} onClose={() => setOpen(false)}>
          <p className="px-3 pt-2 pb-1 text-xs uppercase tracking-wider text-white/50">Timer tidur{label ? ` • sisa ${label}` : ''}</p>
          <div className="grid grid-cols-4 gap-1 px-1.5 pb-1">
            {SLEEP_OPTS.slice(0, 8).map((m) => (
              <button key={m} onClick={() => pick(m)} className={`h-9 rounded-lg text-sm tabular-nums hover:bg-white/10 ${sleepAt && Math.abs(sleepAt - now - m * 60_000) < 30_000 ? 'bg-white/15 font-semibold' : 'bg-white/[.04]'}`}>{m}<span className="text-white/45 text-xs">m</span></button>
            ))}
          </div>
          <div className="h-px bg-white/10 my-1" />
          <MenuItem label="Akhir lagu ini" active={sleepEnd || sleepSongs === 1} onClick={() => pick('end')} />
          <p className="px-3 pt-2 pb-1 text-xs uppercase tracking-wider text-white/50">Jeda setelah</p>
          <div className="grid grid-cols-4 gap-1 px-1.5 pb-1">
            {SLEEP_SONGS.map((n) => (
              <button key={n} onClick={() => pickSongs(n)} className={`h-9 rounded-lg text-sm tabular-nums hover:bg-white/10 ${sleepSongs === n ? 'bg-white/15 font-semibold' : 'bg-white/[.04]'}`}>{n}<span className="text-white/45 text-xs"> lagu</span></button>
            ))}
          </div>
          {active && (<><div className="h-px bg-white/10 my-1" /><MenuItem label="Matikan timer" onClick={() => pick(null)} /></>)}
        </GlassPopover>
      )}
    </>
  );
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function SpeedButton({ className = '', size = 'w-4 h-4', showLabel = false }: { className?: string; size?: string; showLabel?: boolean }) {
  const rate = usePlayer((s) => s.rate);
  const setRate = usePlayer((s) => s.setRate);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={btn} onClick={() => setOpen((o) => !o)} aria-label="Kecepatan putar" title={`Kecepatan ${rate}x`}
        className={`relative flex items-center gap-1.5 rounded-full transition ${rate !== 1 ? 'text-spotify' : 'text-zinc-300 hover:text-white'} ${className}`}>
        {showLabel || rate !== 1 ? <span className="text-xs font-bold tabular-nums min-w-[2ch]">{rate}x</span> : <Gauge className={size} />}
        {showLabel && <span className="text-sm font-semibold">Kecepatan</span>}
      </button>
      {open && btn.current && (
        <GlassPopover anchor={btn.current} onClose={() => setOpen(false)} width={200}>
          <p className="px-3 pt-2 pb-1 text-xs uppercase tracking-wider text-white/50">Kecepatan putar</p>
          {RATES.map((r) => (
            <MenuItem key={r} label={r === 1 ? 'Normal' : `${r}x`} active={rate === r} onClick={() => { setRate(r); setOpen(false); }} />
          ))}
        </GlassPopover>
      )}
    </>
  );
}

export function FocusButton({ className = '', size = 'w-4 h-4', showLabel = false }: { className?: string; size?: string; showLabel?: boolean }) {
  const s = usePlayer();
  const sleepAt = usePlayer((st) => st.sleepAt);
  const [focus, setFocus] = useState(false);

  const toggleFocus = () => {
    if (!focus) {
      s.setVolume(0.5);
      s.setSleep(30);
      setFocus(true);
      toast('Mode Fokus aktif 🧠 · 30 menit & volume 50%');
    } else {
      s.setSleep(null);
      setFocus(false);
      toast('Mode Fokus nonaktif');
    }
  };

  // Matikan indikator bila timer tidur selesai atau dimatikan dari menu lain
  useEffect(() => {
    if (!sleepAt && focus) setFocus(false);
  }, [sleepAt, focus]);

  return (
    <button
      onClick={toggleFocus}
      aria-label="Mode Fokus"
      title={focus ? 'Mode Fokus aktif (30 mnt)' : 'Mode Fokus: 30 mnt & volume 50%'}
      className={`relative flex items-center gap-1.5 rounded-full transition ${focus ? 'text-spotify' : 'text-zinc-300 hover:text-white'} ${className}`}
    >
      <Brain className={size} />
      {showLabel && <span className="text-sm font-semibold">Fokus</span>}
      {focus && <span className="absolute left-1/2 -translate-x-1/2 bottom-0 w-1 h-1 rounded-full bg-spotify" />}
    </button>
  );
}
