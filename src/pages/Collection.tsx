import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Play, Shuffle, Loader2, Heart, Clock, ListMusic, Trash2, Pencil, LibraryBig, CircleArrowDown, Users, Tag } from 'lucide-react';
import { tagLabel, MOOD_TAGS } from '../components/CreatePlaylistModal';
import { collab } from '../lib/social';
import { browse, getNext } from '../lib/api';
import type { Track } from '../lib/types';
import { isPlayable } from '../lib/types';
import Cover from '../components/Cover';
import TrackRow from '../components/TrackRow';
import { useOnline, playableNow } from '../lib/offline';
import { useDownloads } from '../store/downloads';
import { loadPlCache, savePlCache } from '../lib/plCache';
import Shelf from '../components/Shelf';
import { usePlayer } from '../store/player';
import type { Section } from '../lib/types';
import { fmtTime } from '../lib/format';
import { findMix, loadMix } from '../lib/mixes';
import { MixCover } from '../components/DailyMixes';
import { CollectionDownload } from '../components/DownloadButton';
import { UserAvatar } from '../components/Avatar';
import { authApi, type OtherUser, type PlaylistSummary } from '../lib/authApi';
import { useAuth } from '../store/auth';
import { toast } from '../lib/toast';
import { useSmartLists } from '../lib/smartLists';
import SmartCover from '../components/SmartCover';

interface View {
  kind: string;
  title: string;
  subtitle?: string;
  description?: string;
  thumbnail?: string;
  icon?: React.ReactNode;
  gradient?: string;
  tracks: Track[];
  sections?: Section[];
  art?: React.ReactNode;
  /** pemilik playlist (playlist pengguna lain) */
  owner?: OtherUser;
}

export default function Collection() {
  const { id = '', username = '' } = useParams();
  const token = useAuth((s) => s.token);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const mode = pathname.split('/')[1]; // album | playlist | my | liked | history
  const { liked, history, playlists, playList, removeFromPlaylist, deletePlaylist } = usePlayer();
  const [remote, setRemote] = useState<View | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const online = useOnline();
  const dlItems = useDownloads((s) => s.items); // render ulang saat unduhan bertambah/berkurang
  /** filter ala Spotify: tampilkan hanya lagu yang sudah diunduh */
  const [onlyDl, setOnlyDl] = useState(false);

  // Daily Mix (dibuat di perangkat)
  useEffect(() => {
    if (mode !== 'mix') return;
    setRemote(null); setErr(null);
    document.getElementById('main-scroll')?.scrollTo(0, 0);
    const def = findMix(id);
    if (!def) return setErr('Mix tidak ditemukan. Putar & sukai beberapa lagu dulu.');
    loadMix(def)
      .then((tracks) => setRemote({ kind: 'Daily Mix', title: def.title, description: def.desc, subtitle: 'Dibuat untukmu • diperbarui setiap hari', tracks, art: <MixCover mix={def} className="w-48 h-48 lg:w-56 lg:h-56 shrink-0 shadow-[0_8px_40px_rgba(0,0,0,.6)] self-center sm:self-auto" /> }))
      .catch((e) => setErr(e?.message || 'Gagal memuat mix'));
  }, [mode, id]);

  // Playlist milik pengguna lain (/u/:username/p/:id)
  useEffect(() => {
    if (mode !== 'u') return;
    setRemote(null); setErr(null);
    document.getElementById('main-scroll')?.scrollTo(0, 0);
    authApi<{ user: OtherUser; playlist: PlaylistSummary & { tracks: Track[] } }>('user-playlist', { username, id }, token)
      .then(({ user, playlist }) => setRemote({
        kind: 'Playlist publik', title: playlist.name, description: playlist.description, thumbnail: playlist.covers[0],
        gradient: 'from-zinc-700 to-zinc-900', icon: <ListMusic className="w-16 h-16 text-zinc-400" />,
        tracks: playlist.tracks.filter(isPlayable), owner: user,
      }))
      .catch((e) => setErr(e?.message || 'Gagal memuat playlist'));
  }, [mode, id, username, token]);

  const saveCopy = () => {
    if (!remote) return;
    const st = usePlayer.getState();
    const pid = st.createPlaylist(remote.title, remote.description || (remote.owner ? `Disimpan dari @${remote.owner.username}` : ''));
    remote.tracks.forEach((t) => usePlayer.getState().addToPlaylist(pid, t));
    toast('Disimpan ke Pustaka');
    navigate(`/my/${pid}`);
  };

  useEffect(() => {
    if (mode !== 'album' && mode !== 'playlist') return;
    setRemote(null); setErr(null);
    document.getElementById('main-scroll')?.scrollTo(0, 0);
    const cacheKey = `${mode}:${id}`;
    const cached = loadPlCache(cacheKey);
    const fromCache = () => cached && setRemote({ ...cached, subtitle: [cached.subtitle, 'tersimpan di perangkat'].filter(Boolean).join(' • ') });
    // offline: langsung pakai salinan tersimpan
    if (!navigator.onLine && cached) { fromCache(); return; }
    (async () => {
      const bid = mode === 'playlist' && !id.startsWith('VL') && !id.startsWith('RD') ? `VL${id}` : id;
      try {
        const p = await browse(bid);
        let tracks = p.tracks.filter(isPlayable);
        if (!tracks.length && (p.playlistId || id.startsWith('RD'))) tracks = (await getNext(undefined, p.playlistId || id)).tracks.filter(isPlayable);
        const v = {
          kind: mode === 'album' ? 'Album' : 'Playlist',
          title: p.title, subtitle: p.subtitle, description: p.description, thumbnail: p.thumbnail || tracks[0]?.thumbnail, tracks,
        };
        setRemote({ ...v, sections: p.sections });
        if (tracks.length) savePlCache(cacheKey, v);
      } catch (e: any) {
        // mis. radio/mix: langsung ambil dari endpoint next
        try {
          const n = await getNext(undefined, id.replace(/^VL/, ''));
          const tracks = n.tracks.filter(isPlayable);
          if (!tracks.length) throw e;
          setRemote({ kind: 'Mix', title: 'Mix', thumbnail: tracks[0]?.thumbnail, tracks });
        } catch {
          if (cached) fromCache();
          else setErr(navigator.onLine ? e?.message || 'Gagal memuat' : 'Kamu sedang offline — buka playlist ini sekali saat online agar tersimpan di perangkat');
        }
      }
    })();
  }, [mode, id]);

  const smartLists = useSmartLists();
  const smart = mode === 'smart' ? smartLists.find((l) => l.id === id) : undefined;
  const mine = mode === 'my' ? playlists.find((p) => p.id === id) : undefined;
  const view: View | null =
    mode === 'liked' ? { kind: 'Playlist', title: 'Lagu Disukai', tracks: liked, gradient: 'from-[#3b1d6e] to-[#22113f]', icon: <Heart className="w-16 h-16 fill-white" /> }
    : mode === 'history' ? { kind: 'Riwayat', title: 'Baru Diputar', tracks: history, gradient: 'from-[#1e3264] to-[#14213d]', icon: <Clock className="w-16 h-16" /> }
    : mode === 'my' ? (mine ? { kind: 'Playlist Saya', title: mine.name, description: mine.description, tracks: mine.tracks, thumbnail: mine.tracks[0]?.thumbnail, gradient: 'from-zinc-700 to-zinc-900', icon: <ListMusic className="w-16 h-16 text-zinc-400" /> } : null)
    : smart ? { kind: 'Playlist pintar', title: smart.title, description: smart.desc, subtitle: 'Diperbarui otomatis dari kebiasaan dengarmu', tracks: smart.tracks, art: <SmartCover list={smart} className="w-48 h-48 lg:w-56 lg:h-56 shrink-0 shadow-[0_8px_40px_rgba(0,0,0,.6)] self-center sm:self-auto" /> }
    : remote;

  if (mode === 'smart' && !smart) return <p className="text-center text-zinc-400 py-24">Playlist tidak ditemukan</p>;
  if (mode === 'my' && !mine) return <p className="text-center text-zinc-400 py-24">Playlist tidak ditemukan</p>;
  if (err) return <p className="text-center text-zinc-400 py-24">{err}</p>;
  if (!view) return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-zinc-500" /></div>;
  const total = view.tracks.reduce((a, t) => a + (t.duration || 0), 0);
  const dlCount = view.tracks.filter((t) => !!dlItems[t.videoId]).length;
  const shown = onlyDl && dlCount ? view.tracks.filter((t) => !!dlItems[t.videoId]) : view.tracks;
  const avail = playableNow(shown).length;

  return (
    <div className="pb-8">
      <div className="relative px-4 lg:px-6 pt-[max(env(safe-area-inset-top),24px)] pb-6 bg-gradient-to-b from-white/10 to-transparent">
        <div className="flex flex-col sm:flex-row sm:items-end gap-6">
          {view.art ? view.art : view.thumbnail ? (
            <Cover src={view.thumbnail} size={600} className="w-48 h-48 lg:w-56 lg:h-56 shrink-0 shadow-[0_8px_40px_rgba(0,0,0,.6)] self-center sm:self-auto" />
          ) : (
            <div className={`w-48 h-48 lg:w-56 lg:h-56 shrink-0 rounded-md bg-gradient-to-br ${view.gradient} flex items-center justify-center shadow-2xl self-center sm:self-auto`}>{view.icon}</div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold">{view.kind}</p>
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight mt-1 line-clamp-2">{view.title}</h1>
            {view.description && <p className="text-sm text-zinc-400 mt-3 line-clamp-2">{view.description}</p>}
            {mine?.tags && mine.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {mine.tags.map((tg) => (
                  <span key={tg} className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/10 text-zinc-200">
                    {tagLabel(tg)}
                  </span>
                ))}
              </div>
            )}
            <p className="text-sm text-zinc-300 mt-2 flex flex-wrap items-center gap-x-1">
              {view.owner && (
                <button onClick={() => navigate(`/u/${view.owner!.username}`)} className="inline-flex items-center gap-1.5 font-bold text-white hover:underline">
                  <UserAvatar name={view.owner.name} color={view.owner.color} avatar={view.owner.avatar} size={22} />
                  {view.owner.name} •
                </button>
              )}
              {view.subtitle && <span>{view.subtitle} • </span>}
              {view.tracks.length} lagu{total > 0 && `, ${fmtTime(total)}`}
            </p>
          </div>
        </div>
      </div>
      <div className="px-4 lg:px-6">
        <div className="flex items-center gap-4 py-5">
          <button onClick={() => playList(shown)} disabled={!avail} aria-label="Putar" className="w-14 h-14 rounded-full bg-brand flex items-center justify-center hover:scale-105 transition shadow-xl disabled:opacity-40">
            <Play className="w-6 h-6 fill-white ml-0.5" />
          </button>
          <button onClick={() => playList(shown, 0, true)} disabled={!avail} aria-label="Acak" className="p-2 text-zinc-300 hover:text-white disabled:opacity-40"><Shuffle className="w-7 h-7" /></button>
          {mode !== 'history' && <CollectionDownload tracks={view.tracks} />}
          {dlCount > 0 && dlCount < view.tracks.length && (
            <button
              onClick={() => setOnlyDl((v) => !v)}
              aria-pressed={onlyDl}
              title="Tampilkan hanya lagu yang sudah diunduh"
              className={`px-3 h-8 rounded-full text-sm font-semibold flex items-center gap-1.5 transition ${onlyDl ? 'bg-spotify text-white' : 'bg-white/10 text-zinc-200 hover:bg-white/20'}`}
            >
              <CircleArrowDown className="w-4 h-4" /> Terunduh {dlCount}
            </button>
          )}
          {mode === 'u' && view.tracks.length > 0 && !view.owner?.me && (
            <button onClick={saveCopy} className="ml-auto sm:ml-0 px-4 h-9 rounded-full border border-white/30 hover:border-white text-sm font-bold flex items-center gap-2">
              <LibraryBig className="w-4 h-4" /> Simpan ke Pustaka
            </button>
          )}
          {mine && (
            <>
              <button
                data-testid="make-collab-btn"
                onClick={async () => {
                  if (!token) return toast('Masuk ke akun dulu untuk membuat playlist kolaboratif');
                  try { const c = await collab.create(mine.name, mine.description || '', mine.tracks); toast('Playlist kolaboratif dibuat — undang temanmu'); navigate(`/collab/${c.id}`); } catch (e: any) { toast(e.message); }
                }}
                aria-label="Jadikan kolaboratif"
                title="Jadikan kolaboratif"
                className="p-2 text-zinc-400 hover:text-white"
              >
                <Users className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  const current = (mine.tags || []).join(', ');
                  const available = MOOD_TAGS.map((m) => m.id).join(', ');
                  const n = prompt(`Ubah mood playlist (${available})\nPisahkan dengan koma:`, current);
                  if (n !== null) {
                    const parsed = n.split(',').map((x) => x.trim().toLowerCase()).filter((x) => MOOD_TAGS.some((m) => m.id === x)).slice(0, 4);
                    usePlayer.getState().editPlaylistTags(mine.id, parsed);
                  }
                }}
                aria-label="Ubah mood"
                title="Atur mood playlist"
                className="p-2 text-zinc-400 hover:text-white"
              >
                <Tag className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  const n = prompt('Nama playlist', mine.name);
                  if (n?.trim()) usePlayer.getState().editPlaylist(mine.id, n.trim(), mine.description);
                }}
                aria-label="Ubah nama"
                className="p-2 text-zinc-400 hover:text-white"
              >
                <Pencil className="w-5 h-5" />
              </button>
              <button onClick={() => { if (confirm(`Hapus playlist "${mine.name}"?`)) { deletePlaylist(mine.id); navigate('/library'); } }} aria-label="Hapus playlist" className="p-2 text-zinc-400 hover:text-white">
                <Trash2 className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
        {!online && view.tracks.length > 0 && (
          <p role="status" className="mb-3 px-3 py-2 rounded-md bg-white/[.06] text-sm text-zinc-300">
            Kamu sedang offline — {dlCount ? `hanya ${dlCount} dari ${view.tracks.length} lagu yang sudah diunduh bisa diputar.` : 'belum ada lagu di sini yang diunduh.'}
          </p>
        )}
        {view.tracks.length === 0 && <p className="text-zinc-500 py-10 text-center">{mode === 'u' ? 'Playlist ini belum berisi lagu.' : mode === 'history' ? 'Belum ada riwayat. Lagu yang kamu putar akan muncul di sini.' : mode === 'smart' ? 'Belum cukup data. Terus dengarkan musik — playlist ini terisi sendiri.' : mode === 'liked' ? 'Belum ada lagu disukai. Ketuk ♡ pada lagu untuk menyimpannya.' : 'Belum ada lagu. Tambahkan lewat menu ⋯ pada lagu.'}</p>}
        {shown.map((t, i) => (
          <TrackRow
            key={`${t.videoId}-${i}`}
            track={t}
            index={i}
            context={shown}
            showCover={mode !== 'album'}
            onRemove={mine ? () => removeFromPlaylist(mine.id, t.videoId) : undefined}
          />
        ))}
        {view.sections?.length ? <div className="mt-10">{view.sections.map((s, i) => <Shelf key={i} section={s} />)}</div> : null}
      </div>
    </div>
  );
}
