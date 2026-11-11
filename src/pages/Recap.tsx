import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Share2, Clock, Headphones, Music, Mic2, Flame, TrendingUp, TrendingDown, CalendarDays } from 'lucide-react';
import Cover from '../components/Cover';
import { useStats, dayKey, streak, type SongStat } from '../store/stats';
import { usePlayer } from '../store/player';
import { artistNames } from '../lib/format';
import { shareLink } from '../lib/share';
import type { Track } from '../lib/types';

type Period = 'week' | 'month' | 'year';
const PERIODS: { id: Period; label: string }[] = [
  { id: 'week', label: '7 hari' },
  { id: 'month', label: '30 hari' },
  { id: 'year', label: 'Tahun ini' },
];
const DOW = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const DOW_S = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const fmtMin = (sec: number) => {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} j ${m % 60} m` : `${m} m`;
};
const fmtDate = (d: Date, year = false) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });

/** daftar tanggal [mulai, akhir] untuk periode, plus periode sebelumnya sebagai pembanding */
function range(p: Period, now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start: Date;
  let prevStart: Date;
  let prevEnd: Date;
  if (p === 'year') {
    start = new Date(end.getFullYear(), 0, 1);
    prevStart = new Date(end.getFullYear() - 1, 0, 1);
    prevEnd = new Date(end.getFullYear() - 1, end.getMonth(), end.getDate());
  } else {
    const n = p === 'week' ? 7 : 30;
    start = new Date(end); start.setDate(end.getDate() - (n - 1));
    prevEnd = new Date(start); prevEnd.setDate(start.getDate() - 1);
    prevStart = new Date(prevEnd); prevStart.setDate(prevEnd.getDate() - (n - 1));
  }
  const keys = (a: Date, b: Date) => {
    const out: string[] = [];
    for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) out.push(dayKey(d));
    return out;
  };
  return { start, end, days: keys(start, end), prev: keys(prevStart, prevEnd) };
}

interface Row { id: string; n: number; s: number }

export default function Recap() {
  const navigate = useNavigate();
  const st = useStats();
  const [period, setPeriod] = useState<Period>('week');

  const r = useMemo(() => {
    const { start, end, days, prev } = range(period);
    const sumDays = (ks: string[]) => ks.reduce((a, k) => a + (st.days[k] || 0), 0);
    const seconds = sumDays(days);
    const prevSeconds = sumDays(prev);
    const songMap = new Map<string, Row>();
    for (const k of days) {
      const day = st.log?.[k];
      if (!day) continue;
      for (const [id, [n, s]] of Object.entries(day)) {
        const e = songMap.get(id) || { id, n: 0, s: 0 };
        e.n += n; e.s += s;
        songMap.set(id, e);
      }
    }
    const known = [...songMap.values()].filter((x) => st.songs[x.id]);
    const topSongs = known.sort((a, b) => b.n - a.n || b.s - a.s).slice(0, 5).map((x) => ({ ...x, t: (st.songs[x.id] as SongStat).t }));
    const artistMap = new Map<string, { key: string; name: string; thumb?: string; n: number; s: number }>();
    for (const x of songMap.values()) {
      const t = st.songs[x.id]?.t;
      for (const a of (t?.artists || []).slice(0, 2)) {
        if (!a?.name) continue;
        const key = a.id || a.name.toLowerCase();
        const e = artistMap.get(key) || { key, name: a.name, thumb: st.artists[key]?.thumb || t?.thumbnail, n: 0, s: 0 };
        e.n += x.n; e.s += x.s;
        artistMap.set(key, e);
      }
    }
    const topArtists = [...artistMap.values()].sort((a, b) => b.s - a.s || b.n - a.n).slice(0, 5);
    const dow = [0, 0, 0, 0, 0, 0, 0];
    let best = { k: '', s: 0 };
    let active = 0;
    for (const k of days) {
      const s = st.days[k] || 0;
      if (s >= 60) active++;
      const [y, m, d] = k.split('-').map(Number);
      dow[new Date(y, m - 1, d).getDay()] += s;
      if (s > best.s) best = { k, s };
    }
    const topDow = dow.indexOf(Math.max(...dow));
    const plays = [...songMap.values()].reduce((a, x) => a + x.n, 0);
    return {
      start, end, seconds, prevSeconds, plays, uniqueSongs: songMap.size, uniqueArtists: artistMap.size,
      topSongs, topArtists, dow, topDow, best, active, totalDays: days.length, hasLog: songMap.size > 0,
    };
  }, [st.days, st.log, st.songs, st.artists, period]);

  const label = period === 'year' ? `Tahun ${r.end.getFullYear()}` : `${fmtDate(r.start)} – ${fmtDate(r.end, true)}`;
  const change = r.prevSeconds > 0 ? Math.round(((r.seconds - r.prevSeconds) / r.prevSeconds) * 100) : null;
  const top = r.topSongs[0];
  const maxDow = Math.max(1, ...r.dow);

  const playTop = () => {
    const list: Track[] = r.topSongs.map((x) => x.t);
    if (list.length) usePlayer.getState().playList(list, 0);
  };
  const share = () => {
    const lines = [
      `Rekap Stream Beats • ${label}`,
      `🎧 ${fmtMin(r.seconds)} mendengarkan • ${r.plays} lagu diputar`,
      top ? `🏆 Lagu teratas: ${top.t.title} — ${artistNames(top.t)}` : '',
      r.topArtists[0] ? `🎤 Artis teratas: ${r.topArtists[0].name}` : '',
    ].filter(Boolean);
    void shareLink({ url: window.location.origin, title: 'Rekap Stream Beats', text: lines.join('\n') });
  };

  return (
    <div className="pb-10" data-testid="recap-page">
      <div className="sticky top-0 z-10 flex items-center gap-2 px-2 h-14 bg-[#121212]/95 backdrop-blur">
        <button onClick={() => navigate(-1)} aria-label="Kembali" className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10"><ArrowLeft className="w-6 h-6" /></button>
        <h1 className="text-xl font-bold">Rekap</h1>
      </div>

      <div className="px-4 lg:px-6">
        <div className="flex gap-2" role="tablist">
          {PERIODS.map((p) => (
            <button key={p.id} role="tab" aria-selected={period === p.id} onClick={() => setPeriod(p.id)} data-testid={`recap-period-${p.id}`}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition ${period === p.id ? 'bg-spotify text-white' : 'bg-white/[.08] hover:bg-white/[.12]'}`}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-3xl p-6 overflow-hidden relative" style={{ background: 'linear-gradient(135deg,#FA243C 0%,#127a3a 45%,#3b1d6e 100%)' }}>
          <p className="text-xs font-bold tracking-[.2em] uppercase text-white/80">Rekap kamu</p>
          <p className="mt-1 text-sm text-white/80">{label}</p>
          <p className="mt-5 text-5xl font-black tracking-tight" data-testid="recap-minutes">{Math.round(r.seconds / 60).toLocaleString('id-ID')}</p>
          <p className="text-white/90 font-semibold">menit mendengarkan</p>
          {change !== null && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-black/25 px-3 py-1 text-sm font-semibold">
              {change >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {change >= 0 ? '+' : ''}{change}% dari periode sebelumnya
            </p>
          )}
          <div className="mt-6 grid grid-cols-3 gap-3">
            <Mini icon={<Headphones className="w-4 h-4" />} value={r.plays} label="diputar" />
            <Mini icon={<Music className="w-4 h-4" />} value={r.uniqueSongs} label="lagu" />
            <Mini icon={<Mic2 className="w-4 h-4" />} value={r.uniqueArtists} label="artis" />
          </div>
        </div>

        {!r.hasLog && (
          <p className="mt-4 rounded-xl bg-white/[.05] px-4 py-3 text-sm text-zinc-400">
            {r.seconds > 0 ? 'Lagu & artis per periode mulai dicatat sejak pembaruan ini — putar beberapa lagu dan rekapmu akan terisi.' : 'Belum ada aktivitas mendengarkan di periode ini.'}
          </p>
        )}

        {top && (
          <section className="mt-8">
            <h2 className="text-xl font-bold mb-3">Lagu teratas</h2>
            <div className="flex items-center gap-4 rounded-2xl bg-white/[.05] p-4" data-testid="recap-top-song">
              <Cover src={top.t.thumbnail} size={240} className="w-24 h-24 shrink-0 rounded-xl" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold tracking-widest text-spotify">#1</p>
                <p className="text-lg font-bold truncate">{top.t.title}</p>
                <p className="text-sm text-zinc-400 truncate">{artistNames(top.t)}</p>
                <p className="mt-1 text-xs text-zinc-500">{top.n}× diputar • {fmtMin(top.s)}</p>
              </div>
            </div>
            {r.topSongs.length > 1 && (
              <ol className="mt-3 space-y-1">
                {r.topSongs.slice(1).map((x, i) => (
                  <li key={x.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[.04]">
                    <span className="w-5 text-right text-sm font-bold text-zinc-500">{i + 2}</span>
                    <Cover src={x.t.thumbnail} size={96} className="w-11 h-11 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{x.t.title}</p>
                      <p className="text-xs text-zinc-500 truncate">{artistNames(x.t)}</p>
                    </div>
                    <span className="text-xs text-zinc-500 tabular-nums">{x.n}×</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        {r.topArtists.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xl font-bold mb-3">Artis teratas</h2>
            <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
              {r.topArtists.map((a, i) => (
                <div key={a.key} className="w-24 shrink-0 text-center">
                  <div className="relative">
                    <Cover src={a.thumb} size={160} className="w-24 h-24 rounded-full" />
                    <span className="absolute -top-1 -left-1 w-7 h-7 rounded-full bg-spotify text-white text-sm font-black flex items-center justify-center">{i + 1}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold truncate">{a.name}</p>
                  <p className="text-xs text-zinc-500">{fmtMin(a.s)}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-xl font-bold mb-3">Kebiasaan mendengarkan</h2>
          <div className="grid grid-cols-2 gap-3">
            <Fact icon={<CalendarDays className="w-4 h-4" />} label="Hari favorit" value={r.seconds ? DOW[r.topDow] : '—'} />
            <Fact icon={<Clock className="w-4 h-4" />} label="Hari tersibuk" value={r.best.k ? `${fmtDate(new Date(r.best.k + 'T00:00'))} • ${fmtMin(r.best.s)}` : '—'} />
            <Fact icon={<Headphones className="w-4 h-4" />} label="Hari aktif" value={`${r.active} / ${r.totalDays} hari`} />
            <Fact icon={<Flame className="w-4 h-4" />} label="Hari beruntun" value={`${streak(st.days)} hari`} />
          </div>
          <div className="mt-4 rounded-2xl bg-white/[.05] p-4">
            <div className="flex items-end gap-2 h-28">
              {r.dow.map((s, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                  <div className={`w-full rounded-md ${i === r.topDow && s ? 'bg-spotify' : 'bg-white/20'}`} style={{ height: `${Math.max(4, (s / maxDow) * 100)}%` }} />
                  <span className="text-[11px] text-zinc-500">{DOW_S[i]}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="mt-8 grid grid-cols-2 gap-3">
          <button onClick={playTop} disabled={!r.topSongs.length} data-testid="recap-play-top"
            className="h-12 rounded-full bg-spotify text-white font-bold flex items-center justify-center gap-2 disabled:opacity-40"><Play className="w-5 h-5 fill-current" /> Putar teratas</button>
          <button onClick={share} data-testid="recap-share" className="h-12 rounded-full border border-white/30 font-bold flex items-center justify-center gap-2 hover:border-white"><Share2 className="w-5 h-5" /> Bagikan</button>
        </div>
      </div>
    </div>
  );
}

function Mini({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-black/25 px-3 py-3">
      <span className="text-white/80">{icon}</span>
      <p className="mt-1 text-2xl font-black">{value.toLocaleString('id-ID')}</p>
      <p className="text-xs text-white/80">{label}</p>
    </div>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[.05] p-4">
      <p className="flex items-center gap-1.5 text-xs text-zinc-400">{icon} {label}</p>
      <p className="mt-1 font-bold truncate">{value}</p>
    </div>
  );
}
