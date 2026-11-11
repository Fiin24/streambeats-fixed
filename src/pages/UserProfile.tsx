import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Heart, ListMusic, Loader2, Lock, LogIn, Pencil, Share2, Users, UserPlus, UserCheck } from 'lucide-react';
import { followUser } from '../lib/social';
import { UserAvatar } from '../components/Avatar';
import { PlaylistCard } from '../components/UserCards';
import { authApi, type OtherUser, type PlaylistSummary } from '../lib/authApi';
import { useAuth } from '../store/auth';
import { toast } from '../lib/toast';
import { shareLink } from '../lib/share';

interface ProfileRes {
  user: OtherUser; me: boolean; private: boolean; playlists: PlaylistSummary[];
  stats: { playlists: number; liked: number; following: number } | null;
  followingUser?: boolean;
}

const since = (t: number) => new Date(t).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

/** Profil publik pengguna lain: /u/:username */
export default function UserProfile() {
  const { username = '' } = useParams();
  const navigate = useNavigate();
  const token = useAuth((s) => s.token);
  const [data, setData] = useState<ProfileRes | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setData(null); setErr(null);
    authApi<ProfileRes>('profile', { username }, token)
      .then(setData)
      .catch((e) => setErr(e?.message || 'Gagal memuat profil'));
  }, [username, token]);

  if (!token)
    return (
      <div className="flex flex-col items-center text-center gap-4 py-24 px-6">
        <Users className="w-12 h-12 text-zinc-500" />
        <p className="text-zinc-300">Masuk dulu untuk melihat profil pengguna lain.</p>
        <button onClick={() => useAuth.getState().showAuth()} className="flex items-center gap-1.5 px-5 py-2 rounded-full bg-spotify text-white text-sm font-bold"><LogIn className="w-4 h-4" /> Masuk / Daftar</button>
      </div>
    );
  if (err) return <p className="text-center text-zinc-400 py-24 px-6">{err}</p>;
  if (!data) return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-zinc-500" /></div>;

  const { user: u } = data;
  const share = async () => {
    const url = `${location.origin}/u/${u.username}`;
    await shareLink({ url, title: `${u.name} di Stream Beats` });
  };

  return (
    <div className="pb-10">
      <div className="relative overflow-hidden px-4 lg:px-6 pt-[max(env(safe-area-inset-top),16px)] lg:pt-8 pb-7"
        style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${u.color || '#ff6c25'} 60%, #000) 0%, color-mix(in srgb, ${u.color || '#ff6c25'} 18%, #0a0a0a) 70%, transparent 100%)` }}>
        {u.avatar && <img src={u.avatar} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover opacity-25 blur-3xl scale-125 pointer-events-none" />}
        <div className="relative">
          <button onClick={() => (history.length > 1 ? navigate(-1) : navigate('/search'))} aria-label="Kembali" className="w-9 h-9 rounded-full bg-black/30 flex items-center justify-center mb-4 lg:hidden"><ArrowLeft className="w-5 h-5" /></button>
          <div className="flex flex-col sm:flex-row sm:items-end gap-5">
            <UserAvatar name={u.name} color={u.color} avatar={u.avatar} size={144} className="shadow-[0_12px_48px_rgba(0,0,0,.55)] mx-auto sm:mx-0" />
            <div className="min-w-0 text-center sm:text-left">
              <p className="text-sm font-semibold">Profil</p>
              <h1 className="text-4xl lg:text-6xl font-black tracking-tight truncate mt-1">{u.name}</h1>
              <p className="mt-2 text-sm text-zinc-200">@{u.username} • bergabung {since(u.createdAt)}</p>
              {data.stats && (
                <p className="mt-1.5 text-sm text-zinc-300">{data.stats.playlists} playlist • {data.stats.liked} lagu disukai • {data.stats.following} mengikuti</p>
              )}
            </div>
          </div>
          <div className="mt-6 flex items-center justify-center sm:justify-start gap-2">
            {data.me && (
              <button onClick={() => navigate('/profile')} className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-white/30 text-sm font-bold hover:border-white"><Pencil className="w-4 h-4" /> Edit profil</button>
            )}
            {!data.me && (
              <button
                data-testid="follow-user-btn"
                onClick={async () => {
                  try { const r = await followUser(u.username); setData({ ...data, followingUser: r.following }); toast(r.following ? `Mengikuti ${u.name}` : `Berhenti mengikuti ${u.name}`); } catch (e: any) { toast(e.message); }
                }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold ${data.followingUser ? 'border border-white/30 hover:border-white' : 'bg-white text-black'}`}
              >
                {data.followingUser ? <><UserCheck className="w-4 h-4" /> Mengikuti</> : <><UserPlus className="w-4 h-4" /> Ikuti</>}
              </button>
            )}
            <button onClick={share} className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-white/30 text-sm font-bold hover:border-white"><Share2 className="w-4 h-4" /> Bagikan</button>
          </div>
        </div>
      </div>

      <div className="px-4 lg:px-6">
        {data.private ? (
          <div className="flex flex-col items-center text-center gap-3 py-16">
            <span className="w-16 h-16 rounded-full bg-white/[.06] flex items-center justify-center"><Lock className="w-7 h-7 text-zinc-400" /></span>
            <p className="font-bold text-lg">Profil ini privat</p>
            <p className="text-sm text-zinc-400 max-w-xs">@{u.username} memilih menyembunyikan playlist-nya.</p>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold mb-2 mt-2 flex items-center gap-2"><ListMusic className="w-5 h-5 text-zinc-400" /> Playlist publik</h2>
            {data.playlists.length === 0 ? (
              <div className="flex flex-col items-center text-center gap-2 py-14 text-zinc-400">
                <Heart className="w-8 h-8" />
                <p>{data.me ? 'Kamu belum membuat playlist. Buat di Pustaka, lalu sinkronkan.' : `@${u.username} belum punya playlist.`}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-1 -mx-3">
                {data.playlists.map((p) => <PlaylistCard key={p.id} p={p} username={u.username} />)}
              </div>
            )}
            {data.me && <p className="text-xs text-zinc-500 mt-6">Beginilah orang lain melihat profilmu. Playlist yang baru dibuat muncul setelah tersinkron.</p>}
          </>
        )}
      </div>
    </div>
  );
}
