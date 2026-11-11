import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import Cover from './Cover';
import { UserAvatar } from './Avatar';
import type { OtherUser, PlaylistSummary } from '../lib/authApi';

/** Sampul playlist: 1 gambar, atau kolase 2×2 bila ada ≥4 lagu berbeda */
export function PlaylistMosaic({ covers, className = '' }: { covers: string[]; className?: string }) {
  if (covers.length >= 4)
    return (
      <div className={`grid grid-cols-2 grid-rows-2 overflow-hidden rounded-md bg-zinc-800 ${className}`}>
        {covers.slice(0, 4).map((c, i) => <Cover key={i} src={c} size={200} rounded="" className="w-full h-full" />)}
      </div>
    );
  return <Cover src={covers[0]} size={400} className={className} />;
}

/** Kartu pengguna (hasil pencarian) — avatar bulat seperti kartu artis */
export function UserCard({ u, className = '' }: { u: OtherUser; className?: string }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(`/u/${u.username}`)} className={`group w-[148px] sm:w-[172px] shrink-0 p-3 rounded-lg hover:bg-white/[.06] text-left transition ${className}`}>
      <UserAvatar name={u.name} color={u.color} avatar={u.avatar} size={160} className="!w-full !h-auto aspect-square shadow-xl" />
      <p className="mt-3 font-semibold truncate">{u.name}{u.me && <span className="text-zinc-400 font-normal"> (kamu)</span>}</p>
      <p className="text-sm text-zinc-400 truncate flex items-center gap-1">
        @{u.username}{!u.isPublic && <Lock className="w-3 h-3 shrink-0" aria-label="Privat" />}
      </p>
    </button>
  );
}

/** Baris pengguna (daftar hasil di filter "Pengguna") */
export function UserRow({ u }: { u: OtherUser }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(`/u/${u.username}`)} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/[.06] text-left">
      <UserAvatar name={u.name} color={u.color} avatar={u.avatar} size={52} />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold truncate">{u.name}{u.me && <span className="text-zinc-400 font-normal"> (kamu)</span>}</span>
        <span className="block text-sm text-zinc-400 truncate">Profil • @{u.username}</span>
      </span>
      {!u.isPublic && <Lock className="w-4 h-4 text-zinc-500" aria-label="Privat" />}
    </button>
  );
}

export function PlaylistCard({ p, username }: { p: PlaylistSummary; username: string }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(`/u/${username}/p/${encodeURIComponent(p.id)}`)} className="group w-full p-3 rounded-lg hover:bg-white/[.06] text-left transition">
      <PlaylistMosaic covers={p.covers} className="w-full aspect-square shadow-xl" />
      <p className="mt-3 font-semibold truncate">{p.name}</p>
      <p className="text-sm text-zinc-400 truncate">{p.count} lagu{p.description ? ` • ${p.description}` : ''}</p>
    </button>
  );
}
