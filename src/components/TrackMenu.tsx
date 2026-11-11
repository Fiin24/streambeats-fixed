import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, Users, ListPlus, ListEnd, User, Disc3, Heart, Plus, Radio, Share2, Trash2, CircleArrowDown, CircleX, FolderDown, Search, RotateCcw, Link2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Track } from '../lib/types';
import { usePlayer } from '../store/player';
import { toast } from '../lib/toast';
import CreatePlaylistModal from './CreatePlaylistModal';
import { GlassLayers } from './Glass';
import { shareTrack } from '../lib/share';
import { useDownloads, exportToDevice } from '../store/downloads';
import { useCollabs, collab } from '../lib/social';
import { useAuth } from '../store/auth';

export default function TrackMenu({ track, onRemove, className = '' }: { track: Track; onRemove?: () => void; className?: string }) {
  const [open, setOpen] = useState<null | { x: number; y: number }>(null);
  const [sub, setSub] = useState(false);
  const [create, setCreate] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const s = usePlayer();
  const liked = s.liked.some((l) => l.videoId === track.videoId);
  const token = useAuth((a) => a.token);
  const collabs = useCollabs();
  useEffect(() => { if (sub && token) void collabs.load(); }, [sub, token]); // eslint-disable-line react-hooks/exhaustive-deps
  const dl = useDownloads((d) => (d.items[track.videoId] ? 'done' : d.active[track.videoId] != null || d.pending.some((p) => p.videoId === track.videoId) ? 'busy' : null));
  const failed = useDownloads((d) => d.failed[track.videoId] || null);

  // Tutup menu saat tombol back HP / esc ditekan — listener hanya dipasang saat menu terbuka (hemat)
  useEffect(() => {
    if (!open) return;
    const onBack = () => { setOpen(null); setSub(false); };
    window.addEventListener('popstate', onBack);
    return () => window.removeEventListener('popstate', onBack);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(null); setSub(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', esc, true);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); window.removeEventListener('keydown', esc, true); };
  }, [open]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) return setOpen(null);
    const r = btn.current!.getBoundingClientRect();
    const w = 240, h = 420;
    setOpen({ x: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)), y: r.bottom + h > window.innerHeight ? Math.max(8, r.top - h) : r.bottom + 4 });
  };
  const act = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); setOpen(null); setSub(false); };
  const Item = ({ icon: I, label, onClick, className: extra }: { icon: any; label: string; onClick: (e: React.MouseEvent) => void; className?: string }) => (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left rounded-md hover:bg-white/10 ${extra || ''}`}>
      <I className="w-4 h-4 text-zinc-300 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );

  return (
    <>
      <button ref={btn} onClick={toggle} aria-label="Opsi lainnya" className={`p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 ${className}`}>
        <MoreHorizontal className="w-5 h-5" />
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[70]" onClick={() => { setOpen(null); setSub(false); }}>
            <div
              style={{ left: open.x, top: open.y }}
              className="lg lg-dark absolute w-60 rounded-2xl p-1.5 animate-fade-in"
              onClick={(e) => e.stopPropagation()}
            >
              <GlassLayers />
              {!sub ? (
                <>
                  <Item icon={ListEnd} label="Putar berikutnya" onClick={act(() => { s.playNext(track); toast('Diputar berikutnya'); })} />
                  <Item icon={ListPlus} label="Tambahkan ke antrean" onClick={act(() => { s.addToQueue(track); toast('Ditambahkan ke antrean'); })} />
                  <Item icon={Radio} label="Mulai radio" onClick={act(() => s.startRadio(track))} />
                  <Item icon={Heart} label={liked ? 'Hapus dari Lagu Disukai' : 'Simpan ke Lagu Disukai'} onClick={act(() => s.toggleLike(track))} />
                  <Item icon={Plus} label="Tambahkan ke playlist" onClick={(e) => { e.stopPropagation(); setSub(true); }} />
                  {dl === 'done' ? (
                    <>
                      <Item icon={Trash2} label="Hapus unduhan" onClick={act(() => { useDownloads.getState().remove(track.videoId); toast('Unduhan dihapus'); })} />
                      <Item icon={FolderDown} label="Simpan file ke perangkat" onClick={act(() => exportToDevice(track))} />
                    </>
                  ) : dl === 'busy' ? (
                    <Item icon={CircleX} label="Batalkan unduhan" onClick={act(() => { useDownloads.getState().cancel(track.videoId); toast('Unduhan dibatalkan'); })} />
                  ) : (
                    <Item icon={CircleArrowDown} label="Unduh (putar offline)" onClick={act(() => { useDownloads.getState().enqueue([track]); toast('Mengunduh untuk diputar offline…'); })} />
                  )}
                  {track.artists?.[0]?.id && <Item icon={User} label="Buka artis" onClick={act(() => navigate(`/artist/${track.artists[0].id}`))} />}
                  {track.album?.id && <Item icon={Disc3} label="Buka album" onClick={act(() => navigate(`/album/${track.album!.id}`))} />}
                  <Item icon={Share2} label="Bagikan" onClick={act(() => shareTrack(track))} />
                  
                  {/* Link Lain option - always available, highlighted when download failed */}
                  <Item 
                    icon={Link2} 
                    label={failed ? 'Coba Link Lain (unduhan gagal)' : 'Cari Link Lain'} 
                    onClick={act(async () => {
                      const { findAlternatives } = await import('../lib/altSources');
                      const { useDownloads: useDL } = await import('../store/downloads');
                      const alts = await findAlternatives(track, 5);
                      if (!alts.length) return toast('Tidak ada versi lain ditemukan');
                      // Add first alternative to download queue
                      useDL.getState().enqueue(alts.slice(0, 1));
                      toast(`Mencoba versi lain: ${alts[0].title}`);
                    })} 
                    className={failed ? 'text-orange-300' : ''}
                  />
                  
                  {/* Retry download if failed */}
                  {failed && (
    <Item 
      icon={RotateCcw} 
      label="Coba unduh lagi" 
      onClick={act(() => { useDownloads.getState().enqueue([track]); toast('Mencoba unduh lagi…'); })} 
      className="text-orange-300"
    />
)}
                  
                  {onRemove && <Item icon={Trash2} label="Hapus dari daftar ini" onClick={act(onRemove)} />}
                </>
              ) : (
                <>
                  <Item icon={Plus} label="Playlist baru…" onClick={act(() => setCreate(true))} />
                  <div className="h-px bg-white/10 my-1" />
                  {s.playlists.length === 0 && <p className="px-3 py-2 text-sm text-zinc-400">Belum ada playlist</p>}
                  {s.playlists.map((p) => (
                    <Item key={p.id} icon={ListPlus} label={p.name} onClick={act(() => { s.addToPlaylist(p.id, track); toast(`Ditambahkan ke ${p.name}`); })} />
                  ))}
                  {token && collabs.list.filter((c) => c.member).length > 0 && (
                    <>
                      <div className="h-px bg-white/10 my-1" />
                      <p className="px-3 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Kolaboratif</p>
                      {collabs.list.filter((c) => c.member).map((c) => (
                        <Item key={c.id} icon={Users} label={c.name} onClick={act(() => {
                          collab.add(c.id, track).then((r) => toast(r.dup ? `Sudah ada di ${c.name}` : `Ditambahkan ke ${c.name}`)).catch((e) => toast(e.message));
                        })} />
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
      <CreatePlaylistModal open={create} onClose={() => setCreate(false)} withTrack={track} />
    </>
  );
}
