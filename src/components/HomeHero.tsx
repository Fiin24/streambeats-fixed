import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Search, Users, ChevronRight } from 'lucide-react';
import Cover from './Cover';
import Eq from './Eq';
import { UserAvatar } from './Avatar';
import { PlaylistMosaic } from './UserCards';
import { usePlayer } from '../store/player';
import { useAuth, firstName } from '../store/auth';
import { greeting } from '../lib/format';
import { useCoverColor } from '../lib/color';
import type { Item, Track } from '../lib/types';

interface Tile { key: string; title: string; art: React.ReactNode; onClick: () => void; active?: boolean }

/**
 * Bagian atas Beranda: sapaan besar dengan cahaya warna sampul lagu yang diputar,
 * lalu kisi pintasan (Lagu Disukai, playlist kamu, lagu terakhir diputar).
 */
export default function HomeHero({ fallback }: { fallback: Item[] }) {
  const navigate = useNavigate();
  const { liked, history, playlists, current, playing } = usePlayer();
  const user = useAuth((s) => s.user);
  const signed = useAuth((s) => !!s.token);
  const seed = current?.thumbnail || history[0]?.thumbnail;
  const tint = useCoverColor(seed, current?.videoId || history[0]?.videoId || 'home');
  const name = signed ? firstName(user.name) : '';

  const tiles = useMemo(() => {
    const out: Tile[] = [];
    const playTrack = (t: Track, list?: Track[]) => usePlayer.getState().playTrack(t, list);
    if (liked.length)
      out.push({
        key: 'liked', title: 'Lagu Disukai', onClick: () => navigate('/liked'),
        art: <span className="w-full h-full bg-gradient-to-br from-[#450af5] to-[#8e8ee5] flex items-center justify-center"><Heart className="w-5 h-5 fill-white" /></span>,
      });
    [...playlists].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)).slice(0, 3).forEach((p) => {
      const covers = [...new Set(p.tracks.map((t) => t.thumbnail).filter(Boolean) as string[])];
      out.push({ key: `p-${p.id}`, title: p.name, onClick: () => navigate(`/my/${p.id}`), art: <PlaylistMosaic covers={covers} className="w-full h-full !rounded-none" /> });
    });
    for (const t of history) {
      if (out.length >= 8) break;
      out.push({ key: `h-${t.videoId}`, title: t.title, active: current?.videoId === t.videoId, onClick: () => playTrack(t, history), art: <Cover src={t.thumbnail} size={120} rounded="" className="w-full h-full" /> });
    }
    for (const it of fallback) {
      if (out.length >= 8) break;
      if (out.some((x) => x.key === `h-${it.videoId}`)) continue;
      out.push({
        key: `f-${it.id}`, title: it.title, active: !!it.videoId && current?.videoId === it.videoId,
        onClick: () => (it.videoId ? playTrack(it as Track) : it.browseId && navigate(it.type === 'album' ? `/album/${it.browseId}` : it.type === 'artist' ? `/artist/${it.browseId}` : `/playlist/${it.browseId}`)),
        art: <Cover src={it.thumbnail} size={120} rounded="" className="w-full h-full" />,
      });
    }
    return out.slice(0, 8);
  }, [liked.length, playlists, history, fallback, current?.videoId, navigate]);

  return (
    <section className="relative mb-8">
      {/* cahaya warna di belakang sapaan */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -inset-x-5 h-[420px] opacity-70 transition-[background] duration-1000"
        style={{ background: `radial-gradient(60% 60% at 30% 35%, color-mix(in srgb, ${tint} 55%, transparent) 0%, transparent 70%)` }}
      />
      <div className="relative">
        <div className="flex items-end justify-between gap-3 pt-2 lg:pt-4">
          <div className="min-w-0">
            <p className="text-sm text-white/70 font-medium">{new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <h1 className="text-[28px] sm:text-4xl lg:text-[44px] font-black tracking-tight leading-tight truncate">
              {greeting()}{name ? <>, <span className="bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">{name}</span></> : ''}
            </h1>
          </div>
          {signed && (
            <button onClick={() => navigate('/profile')} className="hidden lg:block shrink-0 rounded-full ring-2 ring-white/10 hover:ring-white/40 transition" aria-label="Profil">
              <UserAvatar name={user.name} color={user.color} avatar={user.avatar} size={52} />
            </button>
          )}
        </div>

        {tiles.length > 0 && (
          <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-2">
            {tiles.map((t, k) => (
              <button
                key={t.key}
                onClick={t.onClick}
                style={{ animationDelay: `${k * 35}ms` }}
                className={`group animate-rise-in flex items-center gap-2.5 h-14 rounded-lg overflow-hidden text-left backdrop-blur-md transition
                  ${t.active ? 'bg-white/20' : 'bg-white/[.08] hover:bg-white/[.16] active:bg-white/20'}`}
              >
                <span className="w-14 h-14 shrink-0 overflow-hidden flex shadow-[4px_0_12px_rgba(0,0,0,.35)]">{t.art}</span>
                <span className="min-w-0 flex-1 text-[13px] sm:text-sm font-bold leading-tight line-clamp-2 pr-2">{t.title}</span>
                {t.active && <Eq playing={playing} className="mr-3 shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** Kartu "Temukan teman": cari pengguna lain lewat username, langsung dari Beranda */
export function FindFriends() {
  const navigate = useNavigate();
  const signed = useAuth((s) => !!s.token);
  const [q, setQ] = useState('');
  if (!signed) return null;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = q.trim().replace(/^@/, '');
    if (v) navigate(`/search?q=${encodeURIComponent(v)}&f=users`);
  };
  return (
    <section className="mb-9">
      <div className="relative overflow-hidden rounded-2xl p-5 sm:p-6 bg-gradient-to-br from-[#1f1147] via-[#1a1a2e] to-[#0f2a2a] ring-1 ring-white/[.06]">
        <div aria-hidden className="absolute -right-8 -top-10 w-44 h-44 rounded-full bg-[#7c5cff]/30 blur-3xl" />
        <div aria-hidden className="absolute right-24 -bottom-16 w-40 h-40 rounded-full bg-spotify/20 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
          <span className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0"><Users className="w-6 h-6 text-[#b9a6ff]" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-extrabold text-lg leading-tight">Temukan teman</p>
            <p className="text-sm text-zinc-300 mt-0.5">Cari username, lihat profil dan playlist mereka.</p>
          </div>
          <form onSubmit={submit} className="flex items-center gap-2 sm:w-[320px]">
            <label className="flex-1 flex items-center gap-2 h-11 rounded-full bg-black/40 ring-1 ring-white/10 focus-within:ring-white/40 px-4">
              <Search className="w-4 h-4 text-zinc-400 shrink-0" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="@username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="search"
                className="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-zinc-500"
              />
            </label>
            <button type="submit" aria-label="Cari pengguna" className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center shrink-0 active:scale-95 transition"><ChevronRight className="w-5 h-5" /></button>
          </form>
        </div>
      </div>
    </section>
  );
}
