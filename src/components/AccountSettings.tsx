import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Cloud, CloudOff, Loader2, LogIn, LogOut, KeyRound, Trash2, MonitorSmartphone, UserPlus, Users, X } from 'lucide-react';
import Avatar from './Avatar';
import Modal from './Modal';
import { useAuth, accountLabel } from '../store/auth';
import { useSyncMeta } from '../store/syncMeta';
import { useSyncStatus, syncNow, clearAccountData, switchAccount, addAccount } from '../lib/sync';
import { authApi, type PublicUser } from '../lib/authApi';
import { toast } from '../lib/toast';
import { timeAgo } from '../pages/Profile';

const btn = 'px-4 py-1.5 rounded-full border border-white/30 text-sm font-bold hover:border-white hover:scale-105 transition disabled:opacity-40 disabled:hover:scale-100';
const input = 'w-full h-11 rounded-xl bg-white/[.06] border border-white/10 px-3.5 outline-none focus:border-spotify';

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-white/5">
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        {desc && <p className="text-sm text-zinc-400">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Keluar: simpan perubahan terakhir dulu, lalu hapus data akun dari perangkat ini */
export async function signOut(all = false) {
  const { token } = useAuth.getState();
  if (useSyncMeta.getState().dirty) {
    await syncNow();
    if (useSyncMeta.getState().dirty && !confirm('Ada perubahan yang belum tersinkron (offline?). Tetap keluar? Perubahan itu akan hilang.')) return false;
  }
  if (all && token) {
    try { await authApi('logout-all', {}, token); } catch (e: any) { toast(e.message); return false; }
  }
  clearAccountData();
  useAuth.getState().clearSession();
  toast(all ? 'Keluar dari semua perangkat' : 'Kamu sudah keluar');
  return true;
}

/** Ganti akun: daftar akun yang pernah masuk di perangkat ini + tambah akun */
function AccountSwitcher({ guest = false }: { guest?: boolean }) {
  const navigate = useNavigate();
  const accounts = useAuth((s) => s.accounts);
  const me = useAuth((s) => (s.token ? s.user.uid : null));
  const enabled = useAuth((s) => !!s.status?.enabled);
  const [busy, setBusy] = useState<string | null>(null);
  const others = accounts.filter((a) => a.user.uid !== me).sort((a, b) => b.lastUsed - a.lastUsed);
  if (!others.length && (guest || !enabled)) return null;
  return (
    <div className="py-4 border-b border-white/5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold flex items-center gap-2"><Users className="w-4 h-4" /> Ganti akun</p>
          <p className="text-sm text-zinc-400">Pindah akun tanpa mengetik password lagi. Pustaka tiap akun terpisah.</p>
        </div>
        {enabled && (
          <button disabled={!!busy} onClick={async () => { setBusy('add'); await addAccount(); setBusy(null); }} className={`${btn} shrink-0 flex items-center gap-1.5`}>
            <UserPlus className="w-4 h-4" /> Tambah
          </button>
        )}
      </div>
      {others.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {others.map((a) => (
            <div key={a.user.uid} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[.05]">
              <span className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-black shrink-0 overflow-hidden" style={{ background: a.user.color || '#FA243C' }}>
                {a.user.avatar ? <img src={a.user.avatar} alt="" className="w-full h-full object-cover" /> : (a.user.name || '?')[0].toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{a.user.name}</p>
                <p className="truncate text-xs text-zinc-400">{accountLabel(a.user)}</p>
              </div>
              <button
                disabled={!!busy}
                onClick={async () => { setBusy(a.user.uid); const ok = await switchAccount(a.user.uid); setBusy(null); if (ok) navigate('/', { replace: true }); }}
                className="px-3 py-1 rounded-full bg-white text-black text-sm font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                {busy === a.user.uid && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Beralih
              </button>
              <button
                disabled={!!busy}
                onClick={() => confirm(`Hapus ${accountLabel(a.user) || a.user.name} dari perangkat ini? Akunnya tidak dihapus.`) && useAuth.getState().forgetAccount(a.user.uid)}
                aria-label="Hapus dari perangkat"
                className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AccountSettings() {
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);
  const status = useAuth((s) => s.status);
  const sync = useSyncStatus();
  const lastSyncAt = useSyncMeta((s) => s.lastSyncAt);
  const [pwOpen, setPwOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!token) {
    return (
      <>
      <div className="flex items-center gap-4 py-4 border-b border-white/5">
        <Avatar size={52} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Mode tamu</p>
          <p className="text-sm text-zinc-400">{status?.enabled ? status.google ? 'Buat akun (Google atau username & password) untuk menyimpan pustaka & statistik di semua perangkat.' : 'Buat akun (username & password) untuk menyimpan pustaka & statistik di semua perangkat.' : 'Fitur akun belum diaktifkan di server ini. Data tersimpan di perangkat.'}</p>
        </div>
        {status?.enabled && (
          <button onClick={() => useAuth.getState().showAuth()} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-spotify text-white text-sm font-bold"><LogIn className="w-4 h-4" /> Masuk</button>
        )}
      </div>
      <AccountSwitcher guest />
      </>
    );
  }

  /** akun Google yang belum membuat password */
  const noPw = user.hasPassword === false;
  const changePw = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await authApi<{ token: string; user: PublicUser }>('password', { oldPassword: oldPw, newPassword: newPw }, token);
      useAuth.getState().setSession(r.token, r.user);
      setPwOpen(false); setOldPw(''); setNewPw('');
      toast(noPw ? `Password dibuat. Sekarang kamu juga bisa masuk dengan @${user.username} + password.` : 'Password diganti. Perangkat lain perlu masuk lagi.');
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const del = async () => {
    setBusy(true); setErr(null);
    try {
      await authApi('delete', noPw ? { confirm: oldPw } : { password: oldPw }, token);
      clearAccountData();
      useAuth.getState().clearSession();
      setDelOpen(false);
      toast('Akun dihapus');
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <Link to="/profile" className="flex items-center gap-4 py-4 border-b border-white/5 group">
        <Avatar size={52} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate">{user.name}</p>
          <p className="text-sm text-zinc-400 truncate">{accountLabel(user)}</p>
        </div>
        <span className="text-sm text-zinc-400 group-hover:text-white flex items-center">Lihat profil <ChevronRight className="w-4 h-4" /></span>
      </Link>
      <AccountSwitcher />
      <Row
        title="Sinkronisasi"
        desc={sync.state === 'error' ? `Gagal: ${sync.error}` : sync.state === 'syncing' ? 'Menyinkronkan…' : lastSyncAt ? `Lagu disukai, playlist, riwayat, artis & statistik tersinkron ${timeAgo(lastSyncAt)}` : 'Belum pernah disinkronkan'}
      >
        <button onClick={() => void syncNow()} disabled={sync.state === 'syncing'} className={`${btn} flex items-center gap-1.5`}>
          {sync.state === 'syncing' ? <Loader2 className="w-4 h-4 animate-spin" /> : sync.state === 'error' ? <CloudOff className="w-4 h-4" /> : <Cloud className="w-4 h-4" />} Sinkronkan
        </button>
      </Row>
      <Row title="Password" desc={noPw ? 'Akun ini masuk dengan Google. Buat password agar bisa masuk juga dengan username.' : user.google ? 'Ganti password akun kamu (masuk dengan Google tetap bisa)' : 'Ganti password akun kamu'}>
        <button onClick={() => { setErr(null); setPwOpen(true); }} className={`${btn} flex items-center gap-1.5`}><KeyRound className="w-4 h-4" /> {noPw ? 'Buat' : 'Ganti'}</button>
      </Row>
      <Row title="Keluar" desc="Pustaka tetap aman di akun dan kembali saat kamu masuk lagi">
        <button onClick={() => void signOut()} className={`${btn} flex items-center gap-1.5`}><LogOut className="w-4 h-4" /> Keluar</button>
      </Row>
      <Row title="Keluar dari semua perangkat" desc="Akhiri sesi di HP, tablet & browser lain">
        <button onClick={() => confirm('Keluar dari semua perangkat, termasuk perangkat ini?') && void signOut(true)} className={`${btn} flex items-center gap-1.5`}><MonitorSmartphone className="w-4 h-4" /> Keluar semua</button>
      </Row>
      <Row title="Hapus akun" desc="Menghapus akun dan data tersinkron secara permanen">
        <button onClick={() => { setErr(null); setOldPw(''); setDelOpen(true); }} className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-brand/15 text-brand text-sm font-bold hover:bg-brand/25"><Trash2 className="w-4 h-4" /> Hapus</button>
      </Row>

      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title={noPw ? 'Buat password' : 'Ganti password'}>
        <div className="space-y-3">
          {!noPw && <input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} placeholder="Password lama" autoComplete="current-password" className={input} />}
          <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Password baru (min. 8, huruf & angka)" autoComplete="new-password" className={input} />
          {err && <p className="text-sm text-[#ff8a95]">{err}</p>}
          <button onClick={changePw} disabled={busy || (!noPw && !oldPw) || newPw.length < 8 || !/[A-Za-z]/.test(newPw) || !/\d/.test(newPw)} className="w-full h-11 rounded-full bg-white text-black font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Simpan password
          </button>
        </div>
      </Modal>
      <Modal open={delOpen} onClose={() => setDelOpen(false)} title="Hapus akun?">
        <div className="space-y-3 text-sm text-zinc-300">
          <p>Akun <b className="text-white">{accountLabel(user)}</b> beserta lagu disukai, playlist, dan statistik yang tersinkron akan dihapus permanen. Lagu yang diunduh di perangkat ini tidak ikut terhapus.</p>
          {noPw
            ? <input value={oldPw} onChange={(e) => setOldPw(e.target.value)} placeholder={`Ketik ${user.username || 'username'} untuk konfirmasi`} autoCapitalize="none" autoCorrect="off" spellCheck={false} className={input} />
            : <input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} placeholder="Masukkan password untuk konfirmasi" autoComplete="current-password" className={input} />}
          {err && <p className="text-[#ff8a95]">{err}</p>}
          <button onClick={del} disabled={busy || !oldPw} className="w-full h-11 rounded-full bg-brand text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Hapus akun permanen
          </button>
        </div>
      </Modal>
    </>
  );
}
