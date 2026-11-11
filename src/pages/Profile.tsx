import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Pencil, Settings as Cog, Clock, Headphones, Flame, CalendarDays, Play, Cloud, CloudOff, Loader2, LogIn, Music, Globe, Lock, Sparkles } from 'lucide-react';
import Avatar from '../components/Avatar';
import Cover from '../components/Cover';
import EditProfileModal from '../components/EditProfileModal';
import { useAuth, accountLabel } from '../store/auth';
import { usePlayer } from '../store/player';
import { useFollows } from '../store/follows';
import { useStats, streak, dayKey } from '../store/stats';
import { useSyncMeta } from '../store/syncMeta';
import { useSyncStatus, syncNow } from '../lib/sync';
import { img } from '../lib/img';

const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const fmtMin = (sec: number) => {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} j ${m % 60} m` : `${m} m`;
};
export const timeAgo = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'baru saja';
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
};

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[.05] p-4">
      <div className="flex items-center gap-2 text-zinc-400 text-xs font-semibold uppercase tracking-wide">{icon}{label}</div>
      <p className="mt-2 text-2xl font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const signed = useAuth((s) => !!s.token);
  const authEnabled = useAuth((s) => !!s.status?.enabled);
  const { playlists, liked, playList } = usePlayer();
  const follows = useFollows((s) => s.artists);
  const st = useStats();
  const sync = useSyncStatus();
  const lastSyncAt = useSyncMeta((s) => s.lastSyncAt);
  const [edit, setEdit] = useState(false);

  const week = useMemo(() => {
    const out: { label: string; sec: number; today: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      out.push({ label: DAYS[d.getDay()], sec: st.days[dayKey(d)] || 0, today: i === 0 });
    }
    return out;
  }, [st.days]);
  const maxDay = Math.max(60, ...week.map((d) => d.sec));
  const weekSec = week.reduce((a, d) => a + d.sec, 0);
  const topSongs = useMemo(() => Object.values(st.songs).filter((x) => x.n > 0).sort((a, b) => b.n - a.n || b.s - a.s).slice(0, 5), [st.songs]);
  const topArtists = useMemo(() => Object.values(st.artists).filter((x) => x.n > 0).sort((a, b) => b.n - a.n || b.s - a.s).slice(0, 6), [st.artists]);
  const thumbFor = (name: string) => topSongs.find((s) => s.t.artists?.some((a) => a.name === name))?.t.thumbnail
    || Object.values(st.songs).find((s) => s.t.artists?.some((a) => a.name === name))?.t.thumbnail;

  return (
    <div className="pb-10">
      <div className="relative px-4 lg:px-6 pt-[max(env(safe-area-inset-top),24px)] lg:pt-10 pb-6"
        style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${signed ? user.color || '#ff6c25' : '#3f3f46'} 55%, #000) 0%, transparent 100%)` }}>
        <div className="flex flex-col sm:flex-row sm:items-end gap-5">
          <Avatar size={128} className="shadow-2xl ring-4 ring-black/20 mx-auto sm:mx-0" />
          <div className="min-w-0 text-center sm:text-left">
            <p className="text-sm font-semibold">Profil</p>
            <h1 className="text-4xl lg:text-6xl font-black tracking-tight truncate mt-1">{signed ? user.name : 'Tamu'}</h1>
            {signed ? (
              <p className="mt-2 text-sm text-zinc-200 flex items-center justify-center sm:justify-start gap-1.5 flex-wrap">
                <span className="truncate">{accountLabel(user)}</span>
                <span className="inline-flex items-center gap-1 text-zinc-300">• {user.isPublic !== false ? <><Globe className="w-3.5 h-3.5" /> Publik</> : <><Lock className="w-3.5 h-3.5" /> Privat</>}</span>
              </p>
            ) : (
              <p className="mt-2 text-sm text-zinc-300">Data hanya tersimpan di perangkat ini.</p>
            )}
            <p className="mt-2 text-sm text-zinc-300">{playlists.length} playlist • {liked.length} lagu disukai • {follows.length} mengikuti</p>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-center sm:justify-start gap-2 flex-wrap">
          {signed ? (
            <button onClick={() => setEdit(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-white/30 text-sm font-bold hover:border-white"><Pencil className="w-4 h-4" /> Edit profil</button>
          ) : authEnabled ? (
            <button onClick={() => useAuth.getState().showAuth()} className="flex items-center gap-1.5 px-5 py-2 rounded-full bg-spotify text-white text-sm font-bold"><LogIn className="w-4 h-4" /> Masuk / Daftar</button>
          ) : null}
          {signed && user.username && (
            <button onClick={() => navigate(`/u/${user.username}`)} className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-white/30 text-sm font-bold hover:border-white"><Globe className="w-4 h-4" /> Lihat profil publik</button>
          )}
          <button onClick={() => navigate('/settings')} className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-white/30 text-sm font-bold hover:border-white"><Cog className="w-4 h-4" /> Pengaturan</button>
          {signed && (
            <button onClick={() => void syncNow()} disabled={sync.state === 'syncing'} className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm text-zinc-300 hover:text-white" title="Sinkronkan sekarang">
              {sync.state === 'syncing' ? <Loader2 className="w-4 h-4 animate-spin" /> : sync.state === 'error' ? <CloudOff className="w-4 h-4 text-brand" /> : <Cloud className="w-4 h-4 text-spotify" />}
              {sync.state === 'syncing' ? 'Menyinkronkan…' : sync.state === 'error' ? 'Gagal sinkron — coba lagi' : lastSyncAt ? `Tersinkron ${timeAgo(lastSyncAt)}` : 'Sinkronkan'}
            </button>
          )}
        </div>
      </div>

      <div className="px-4 lg:px-6 space-y-10">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold">Statistik mendengarkan</h2>
            <Link to="/recap" data-testid="profile-recap-link" className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-spotify text-white text-sm font-bold"><Sparkles className="w-4 h-4" /> Rekap</Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon={<Clock className="w-4 h-4" />} label="Total waktu" value={fmtMin(st.totalS)} />
            <StatCard icon={<Headphones className="w-4 h-4" />} label="Lagu diputar" value={String(st.totalN)} />
            <StatCard icon={<Flame className="w-4 h-4" />} label="Hari beruntun" value={`${streak(st.days)} hari`} />
            <StatCard icon={<CalendarDays className="w-4 h-4" />} label="7 hari terakhir" value={fmtMin(weekSec)} />
          </div>
          <div className="mt-4 rounded-xl bg-white/[.05] p-4">
            <p className="text-sm text-zinc-400 mb-3">Menit per hari</p>
            <div className="flex items-end gap-2 h-32">
              {week.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end" title={`${d.label}: ${fmtMin(d.sec)}`}>
                  <span className="text-[10px] text-zinc-400 tabular-nums">{d.sec >= 60 ? Math.round(d.sec / 60) : ''}</span>
                  <div className={`w-full max-w-[38px] rounded-md transition-all ${d.today ? 'bg-spotify' : 'bg-white/25'}`} style={{ height: `${Math.max(4, (d.sec / maxDay) * 100)}%` }} />
                  <span className={`text-xs ${d.today ? 'text-white font-bold' : 'text-zinc-500'}`}>{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold">Lagu teratas kamu</h2>
            {topSongs.length > 0 && (
              <button onClick={() => playList(topSongs.map((s) => s.t))} className="w-11 h-11 rounded-full bg-spotify text-white flex items-center justify-center hover:scale-105" aria-label="Putar lagu teratas"><Play className="w-5 h-5 fill-black" /></button>
            )}
          </div>
          {topSongs.length ? (
            <div className="space-y-1">
              {topSongs.map((s, i) => (
                <button key={s.t.videoId} onClick={() => playList(topSongs.map((x) => x.t), i)} className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-white/[.07] text-left">
                  <span className="w-5 text-center text-zinc-400 tabular-nums">{i + 1}</span>
                  <Cover src={s.t.thumbnail} size={120} className="w-12 h-12" rounded="rounded" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{s.t.title}</span>
                    <span className="block truncate text-sm text-zinc-400">{s.t.artists?.map((a) => a.name).join(', ')}</span>
                  </span>
                  <span className="text-sm text-zinc-400 tabular-nums shrink-0">{s.n}× diputar</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-zinc-500 flex items-center gap-2 py-6"><Music className="w-5 h-5" /> Putar beberapa lagu — lagu favoritmu akan muncul di sini.</p>
          )}
        </section>

        {topArtists.length > 0 && (
          <section>
            <h2 className="text-xl font-bold mb-3">Artis teratas kamu</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              {topArtists.map((a) => {
                const body = (
                  <>
                    <Cover src={a.thumb || thumbFor(a.name)} size={240} className="w-full aspect-square" rounded="rounded-full" />
                    <p className="mt-2 font-semibold truncate text-center">{a.name}</p>
                    <p className="text-xs text-zinc-400 text-center">{a.n}× diputar</p>
                  </>
                );
                return a.id ? <Link key={a.name} to={`/artist/${a.id}`} className="p-2 rounded-lg hover:bg-white/[.06]">{body}</Link> : <div key={a.name} className="p-2">{body}</div>;
              })}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-xl font-bold mb-3">Mengikuti</h2>
          {follows.length ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              {follows.map((a) => (
                <Link key={a.id} to={`/artist/${a.id}`} className="p-2 rounded-lg hover:bg-white/[.06]">
                  <img src={img(a.thumbnail, 240)} alt="" referrerPolicy="no-referrer" className="w-full aspect-square rounded-full object-cover bg-zinc-800" />
                  <p className="mt-2 font-semibold truncate text-center">{a.name}</p>
                  <p className="text-xs text-zinc-400 text-center">Artis</p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-zinc-500 py-4">Belum mengikuti artis. Buka halaman artis lalu ketuk <b className="text-zinc-300">Ikuti</b>.</p>
          )}
        </section>
      </div>
      <EditProfileModal open={edit} onClose={() => setEdit(false)} />
    </div>
  );
}
