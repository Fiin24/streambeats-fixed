import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Bell, BellOff, CheckCheck, RefreshCw } from 'lucide-react';
import Modal from './Modal';
import Cover from './Cover';
import { useReleases, useUnreadReleases, type Release } from '../store/releases';
import { useFollows } from '../store/follows';
import { useSettings } from '../store/settings';
import { toast } from '../lib/toast';
import { UserPlus, UserCheck } from 'lucide-react';
import { useUserNotifs, useUnreadFollows } from '../store/userNotifs';

function ago(t: number) {
  const m = Math.max(1, Math.round((Date.now() - t) / 60000));
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} hari lalu` : new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

/** Tombol lonceng + badge jumlah rilisan baru; ketuk untuk membuka daftar notifikasi */
export default function NotificationBell({ className = '', iconClass = 'w-5 h-5' }: { className?: string; iconClass?: string }) {
  const [open, setOpen] = useState(false);
  const unread = useUnreadReleases() + useUnreadFollows();
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={unread ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'} title="Notifikasi" className={`relative ${className}`}>
        <Bell className={iconClass} />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-white text-[10px] font-bold leading-[18px] text-center ring-2 ring-black/40">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {/* portal: header memakai efek kaca (backdrop-filter) yang akan memotong elemen fixed */}
      {open && createPortal(<NotificationsSheet onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function NotificationsSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const items = useReleases((s) => s.items);
  const checking = useReleases((s) => s.checking);
  const { check, markRead } = useReleases.getState();
  const following = useFollows((s) => s.artists.length);
  const enabled = useSettings((s) => s.releaseAlerts);
  const follows = useUserNotifs((s) => s.items);
  const unread = items.filter((r) => !r.read).length + follows.filter((n) => !n.read).length;

  const open = (r: Release) => {
    markRead(r.id);
    onClose();
    navigate(`/album/${r.id}`);
  };
  const refresh = async () => {
    const n = await check(true);
    if (!n) toast(following ? 'Belum ada rilisan baru' : 'Ikuti artis dulu untuk mendapat notifikasi');
  };

  return (
    <Modal open onClose={onClose} title="Notifikasi">
      <div className="flex items-center justify-between gap-2 -mt-1 mb-3">
        <p className="text-sm text-zinc-400">{following ? `Rilisan baru dari ${following} artis yang kamu ikuti` : 'Belum mengikuti artis'}</p>
        <div className="flex items-center gap-1 shrink-0">
          {unread > 0 && (
            <button onClick={() => { markRead(); useUserNotifs.getState().markRead(); }} className="lg-btn p-2 rounded-full" aria-label="Tandai semua dibaca" title="Tandai semua dibaca">
              <CheckCheck className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => void refresh()} disabled={checking || !following} className="lg-btn p-2 rounded-full disabled:opacity-40" aria-label="Periksa sekarang" title="Periksa sekarang">
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {!enabled && (
        <div className="mb-3 rounded-xl bg-white/5 px-3 py-2.5 text-sm text-zinc-300 flex items-center gap-2">
          <BellOff className="w-4 h-4 shrink-0" /> Notifikasi rilisan dimatikan.
          <button onClick={() => useSettings.getState().set({ releaseAlerts: true })} className="ml-auto font-semibold text-white">Aktifkan</button>
        </div>
      )}

      <div className="max-h-[60vh] overflow-y-auto -mx-2 px-1">
        {follows.length > 0 && (
          <div className="mb-2" data-testid="follow-notifs">
            <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Pengikut baru</p>
            {follows.map((n) => (
              <div key={n.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5">
                <button onClick={() => { useUserNotifs.getState().markRead(n.id); onClose(); navigate(`/u/${n.user.username}`); }} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                  {n.user.avatar
                    ? <img src={n.user.avatar} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
                    : <span className="w-12 h-12 rounded-full shrink-0 flex items-center justify-center font-bold text-lg" style={{ background: n.user.color }}>{(n.user.name || n.user.username || '?')[0].toUpperCase()}</span>}
                  <span className="min-w-0">
                    <span className={`block text-[11px] font-semibold ${n.read ? 'text-zinc-500' : 'text-brand'}`}>Pengikut baru · {ago(n.at)}</span>
                    <span className="block font-semibold truncate">{n.user.name || n.user.username}</span>
                    <span className="block text-sm text-zinc-400 truncate">@{n.user.username} mulai mengikutimu</span>
                  </span>
                </button>
                <button onClick={() => void useUserNotifs.getState().followBack(n)} data-testid="follow-back-btn"
                  className={`shrink-0 flex items-center gap-1 px-3 h-8 rounded-full text-xs font-bold ${n.followingBack ? 'border border-white/30' : 'bg-white text-black'}`}>
                  {n.followingBack ? <><UserCheck className="w-3.5 h-3.5" /> Mengikuti</> : <><UserPlus className="w-3.5 h-3.5" /> Ikuti balik</>}
                </button>
                {!n.read && <span className="w-2.5 h-2.5 rounded-full bg-brand shrink-0" />}
              </div>
            ))}
            {items.length > 0 && <p className="px-2 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Rilisan</p>}
          </div>
        )}
        {items.length === 0 ? (follows.length ? null : 
          <div className="py-10 text-center text-zinc-400 text-sm">
            <Bell className="w-10 h-10 mx-auto mb-3 opacity-40" />
            {checking ? 'Memeriksa rilisan terbaru…' : following ? 'Belum ada rilisan baru. Kami akan memberi tahu saat artis favoritmu merilis lagu.' : 'Ketuk "Ikuti" di halaman artis untuk mendapat notifikasi saat mereka merilis lagu baru.'}
          </div>
        ) : (
          items.map((r) => (
            <button key={r.id} onClick={() => open(r)} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 active:bg-white/10 text-left transition">
              <Cover src={r.thumbnail} size={120} className="w-14 h-14 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className={`text-[11px] font-semibold ${r.read ? 'text-zinc-500' : 'text-brand'}`}>
                  {r.read ? 'Rilisan terbaru' : 'Rilisan baru'} · {r.kind}{r.year ? ` · ${r.year}` : ''}
                </p>
                <p className="font-semibold truncate">{r.title}</p>
                <p className="text-sm text-zinc-400 truncate">{r.artistName} · {ago(r.at)}</p>
              </div>
              {!r.read && <span className="w-2.5 h-2.5 rounded-full bg-brand shrink-0" aria-label="Belum dibaca" />}
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
