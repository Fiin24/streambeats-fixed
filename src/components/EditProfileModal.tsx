import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Globe, Loader2, Lock, Trash2 } from 'lucide-react';
import Modal from './Modal';
import { UserAvatar } from './Avatar';
import { useAuth } from '../store/auth';
import { authApi, type PublicUser } from '../lib/authApi';
import { squareAvatar } from '../lib/imageResize';
import { toast } from '../lib/toast';

const COLORS = ['#ff6c25', '#FA243C', '#3080FF', '#FA243C', '#EDB200', '#a855f7', '#14b8a6', '#ec4899'];

export default function EditProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);
  const [name, setName] = useState(user.name);
  const [color, setColor] = useState(user.color || COLORS[0]);
  const [isPublic, setIsPublic] = useState(user.isPublic !== false);
  /** foto baru (data URL) yang belum disimpan; '' = hapus foto; null = tidak diubah */
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) { setName(user.name); setColor(user.color || COLORS[0]); setIsPublic(user.isPublic !== false); setPhoto(null); setErr(null); }
  }, [open]); // eslint-disable-line

  const pick = async (f?: File | null) => {
    if (!f) return;
    setErr(null);
    setReading(true);
    try { setPhoto(await squareAvatar(f)); } catch (e: any) { setErr(e.message || 'Foto tidak bisa dipakai'); } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      let r = await authApi<{ user: PublicUser }>('update', { name, color, isPublic }, token);
      if (photo) r = await authApi<{ user: PublicUser }>('avatar-upload', { image: photo }, token, 30000);
      else if (photo === '') r = await authApi<{ user: PublicUser }>('avatar-remove', {}, token);
      useAuth.getState().setUser(r.user);
      toast('Profil disimpan');
      onClose();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const shown = photo === null ? user.avatar : photo || null;

  return (
    <Modal open={open} onClose={onClose} title="Edit profil">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <button type="button" onClick={() => fileRef.current?.click()} aria-label="Ganti foto profil" className="group relative rounded-full">
            <UserAvatar name={name} color={color} avatar={shown} size={112} className="shadow-2xl ring-4 ring-white/10" />
            <span className="absolute inset-0 rounded-full bg-black/45 flex flex-col items-center justify-center gap-1 text-xs font-bold opacity-0 group-hover:opacity-100 transition">
              <Camera className="w-6 h-6" /> Ganti foto
            </span>
            {reading && <span className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin" /></span>}
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} aria-label="Pilih foto" className="absolute -right-1 -bottom-1 w-10 h-10 rounded-full bg-spotify text-white flex items-center justify-center shadow-xl ring-4 ring-zinc-900 active:scale-95 transition">
            <Camera className="w-5 h-5" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        </div>
        <div className="flex items-center gap-2 -mt-1">
          <button type="button" onClick={() => fileRef.current?.click()} className="px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-sm font-semibold">
            {shown ? 'Ganti foto' : 'Unggah foto'}
          </button>
          {shown && (
            <button type="button" onClick={() => setPhoto('')} className="px-3.5 py-1.5 rounded-full text-sm font-semibold text-zinc-400 hover:text-white flex items-center gap-1.5">
              <Trash2 className="w-4 h-4" /> Hapus foto
            </button>
          )}
        </div>
        {!shown && (
          <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Warna avatar">
            {COLORS.map((c) => (
              <button key={c} role="radio" aria-checked={c === color} aria-label={`Warna ${c}`} onClick={() => setColor(c)} className="w-8 h-8 rounded-full flex items-center justify-center transition hover:scale-110" style={{ background: c, boxShadow: c === color ? '0 0 0 2px #fff' : undefined }}>
                {c === color && <Check className="w-4 h-4 text-black" strokeWidth={3} />}
              </button>
            ))}
          </div>
        )}
        <label className="w-full">
          <span className="text-[13px] font-semibold text-zinc-300">Nama tampilan</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="mt-1.5 w-full h-11 rounded-xl bg-white/[.06] border border-white/10 px-3.5 outline-none focus:border-spotify" />
        </label>
        <button type="button" onClick={() => setIsPublic(!isPublic)} role="switch" aria-checked={isPublic} className="w-full flex items-center gap-3 rounded-xl bg-white/[.04] border border-white/10 px-3.5 py-3 text-left">
          {isPublic ? <Globe className="w-5 h-5 text-spotify shrink-0" /> : <Lock className="w-5 h-5 text-zinc-400 shrink-0" />}
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold">Profil publik</span>
            <span className="block text-xs text-zinc-400">{isPublic ? 'Orang lain bisa menemukan & melihat playlist kamu' : 'Playlist kamu disembunyikan dari orang lain'}</span>
          </span>
          <span className={`w-11 h-6 rounded-full p-0.5 transition ${isPublic ? 'bg-spotify' : 'bg-white/20'}`}>
            <span className={`block w-5 h-5 rounded-full bg-white shadow transition ${isPublic ? 'translate-x-5' : ''}`} />
          </span>
        </button>
        {err && <p className="w-full text-sm text-[#ff8a95]">{err}</p>}
        <button onClick={save} disabled={busy || reading || name.trim().length < 2} className="w-full h-11 rounded-full bg-white text-black font-bold flex items-center justify-center gap-2 disabled:opacity-50">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Simpan
        </button>
      </div>
    </Modal>
  );
}
