import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Users, User, UserX, Link2, Unlink, Loader2, Settings as Gear, Cloud, Check, X, Volume2, Bug, ChevronRight,
  Copy, Share2, Crown, Ban, Music2, Trash2, Radio, RotateCw, Plus, LogIn, ClipboardPaste, ListMusic, History, ListPlus, Eye, type LucideIcon,
} from 'lucide-react';
import { useTogether, DEFAULT_SERVERS, type TogetherMember } from '../store/together';
import type { Track } from '../lib/types';
import { loadFriends, type Friend } from '../lib/social';
import { usePlayer } from '../store/player';
import { useAuth } from '../store/auth';
import { connect, disconnect, reconnect, memberAction, transferHost, saveRoomPlaylist, blockMember, respondSuggestion, inviteLink, parseInvite, testServer, serverBase, guestToggle } from '../lib/together';
import { copyText, shareLink, readClipboard } from '../lib/share';
import { toast } from '../lib/toast';
import { artistNames } from '../lib/format';
import { SERIF } from '../lib/fonts';
import Cover from '../components/Cover';
import Modal from '../components/Modal';

/** Warna aksen (sama dengan halaman Tentang) */
const ACCENT = '#C8643F';
const ACCENT_DEEP = '#A8431F';

/* ─────────────────────────── komponen dasar ─────────────────────────── */

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="sticky top-0 z-10 -mx-4 lg:-mx-6 px-2 lg:px-4 pt-[max(env(safe-area-inset-top),10px)] lg:pt-4 pb-2 bg-[#0a0a0a]/90 lg:bg-panel/90 backdrop-blur-md flex items-center gap-2">
      <button onClick={onBack} aria-label="Kembali" className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-white/10 active:scale-95 transition">
        <ArrowLeft className="w-6 h-6" />
      </button>
      <h1 className="text-[26px] font-semibold truncate" style={{ fontFamily: SERIF }}>{title}</h1>
    </div>
  );
}

const card = 'rounded-2xl bg-white/[.035] border border-white/[.08]';

function Field({ icon: Icon, value, onChange, placeholder, disabled, upper, maxLength, testId }: {
  icon: LucideIcon; value: string; onChange: (v: string) => void; placeholder: string; disabled?: boolean; upper?: boolean; maxLength?: number; testId?: string;
}) {
  return (
    <label className={`flex items-center gap-4 h-[60px] px-5 rounded-2xl border border-white/[.16] focus-within:border-[#C8643F] transition ${disabled ? 'opacity-50' : ''}`}>
      <Icon className="w-6 h-6 shrink-0" style={{ color: ACCENT }} strokeWidth={1.7} />
      <input
        value={value}
        onChange={(e) => onChange(upper ? e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') : e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        autoCapitalize={upper ? 'characters' : 'off'}
        autoCorrect="off"
        spellCheck={false}
        data-testid={testId}
        className={`flex-1 min-w-0 bg-transparent outline-none text-[17px] placeholder:text-zinc-500 ${upper && value ? 'tracking-[.25em] font-semibold' : ''}`}
      />
      {value && !disabled && (
        <button type="button" onClick={() => onChange('')} aria-label="Hapus" className="w-8 h-8 -mr-2 rounded-full flex items-center justify-center text-zinc-400 hover:bg-white/10">
          <X className="w-5 h-5" />
        </button>
      )}
    </label>
  );
}

/** Saklar bergaya Material 3 (ikon ✓ / ✕ di kenop) seperti gambar referensi */
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative w-[60px] h-[34px] rounded-full border-2 transition-colors shrink-0 ${on ? 'border-transparent' : 'border-zinc-500 bg-zinc-800/60'}`}
      style={on ? { background: ACCENT } : undefined}
    >
      <span className={`absolute top-1/2 -translate-y-1/2 rounded-full flex items-center justify-center transition-all duration-200 ${on ? 'left-[28px] w-[26px] h-[26px] bg-white' : 'left-[4px] w-[22px] h-[22px] bg-zinc-500'}`}>
        {on ? <Check className="w-4 h-4" style={{ color: ACCENT }} strokeWidth={3} /> : <X className="w-3.5 h-3.5 text-zinc-800" strokeWidth={3} />}
      </span>
    </button>
  );
}

function SRow({ icon: Icon, title, desc, onClick, right }: { icon: LucideIcon; title: string; desc?: ReactNode; onClick?: () => void; right?: ReactNode }) {
  const inner = (
    <>
      <Icon className="w-6 h-6 text-zinc-300 shrink-0" strokeWidth={1.6} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[17px] leading-snug">{title}</p>
        {desc && <p className="text-[15px] text-zinc-400 leading-snug mt-0.5">{desc}</p>}
      </div>
      {right ?? (onClick ? <ChevronRight className="w-5 h-5 text-zinc-500 shrink-0" /> : null)}
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="w-full flex items-center gap-5 px-5 py-4 text-left hover:bg-white/[.03] active:bg-white/[.06] transition">{inner}</button>
  ) : (
    <div className="flex items-center gap-5 px-5 py-4">{inner}</div>
  );
}

/* ─────────────────────────── halaman utama ─────────────────────────── */

const STATUS: Record<string, { label: string; dot: string }> = {
  idle: { label: 'Terputus', dot: '#78716c' },
  error: { label: 'Gagal terhubung', dot: '#ef4444' },
  connecting: { label: 'Menghubungkan…', dot: '#eab308' },
  pending: { label: 'Menunggu persetujuan host', dot: '#eab308' },
  connected: { label: 'Terhubung', dot: '#22c55e' },
};

function TogetherHome() {
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const t = useTogether();
  const authName = useAuth((a) => (a.token ? a.user.username || a.user.name : ''));
  // username sengaja kosong: host mengisi namanya sendiri, tamu mengisi username host
  const [name, setName] = useState(sp.get('host')?.slice(0, 24) || '');
  const [code, setCode] = useState(sp.get('code')?.toUpperCase().replace(/[^A-Z0-9]/g, '') || '');
  const busy = t.status === 'connecting';
  const active = t.status === 'connected' || t.status === 'pending';
  const st = STATUS[t.status] || STATUS.idle;
  const [mode, setMode] = useState<null | 'create' | 'join'>(sp.get('code') || sp.get('host') ? 'join' : null);
  const joining = mode === 'join';
  const canSubmit = !busy && name.trim().length >= 2 && (!joining || code.length >= 4);
  const submit = () => void connect(name, joining ? code : '', t.username || authName);
  const pick = (m: 'create' | 'join' | null) => { setMode(m); if (m !== 'join') setCode(''); if (t.error) t.set({ error: null }); };
  const [pasteOpen, setPasteOpen] = useState(false);
  const applyInvite = (text: string) => {
    const inv = parseInvite(text);
    if (!inv.code) return toast('Kode sesi tidak ditemukan di pesan undangan'), false;
    setMode('join');
    setCode(inv.code);
    if (inv.host) setName(inv.host);
    toast(inv.host ? `Terisi: ${inv.host} • ${inv.code}` : `Kode ${inv.code} terisi — isi username host`);
    return true;
  };
  const paste = async () => {
    const text = await readClipboard();
    if (text == null) setPasteOpen(true);
    else if (!text.trim()) toast('Clipboard kosong — salin pesan undangan dulu');
    else applyInvite(text);
  };

  // tautan undangan /together?code=XXXX&host=nama → isi kode & username host lalu bersihkan URL
  useEffect(() => {
    if (sp.get('code') || sp.get('host')) { sp.delete('code'); sp.delete('host'); setSp(sp, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="mt-4 flex flex-col items-center text-center px-2">
        <div className="w-[96px] h-[96px] rounded-full flex items-center justify-center" style={{ background: ACCENT_DEEP }}>
          <Users className="w-12 h-12 text-[#f6e3d9]" strokeWidth={1.7} />
        </div>
        <h2 className="mt-5 text-[34px] leading-tight font-bold" style={{ fontFamily: SERIF }}>Dengar bersama</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-zinc-400 max-w-md">
          Dengarkan musik bersama teman Anda secara real time. Buat ruangan untuk menjadi host, atau bergabung ke ruangan yang ada dengan kode
        </p>
      </div>

      {/* Status */}
      <div className={`${card} mt-5 p-5`} data-testid="together-status-card">
        <p className="flex items-center justify-center gap-2.5 text-[18px] font-semibold text-zinc-300" data-testid="together-status">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="w-3 h-3 rounded-full" style={{ background: st.dot }} />}
          {st.label}
          {t.status === 'connected' && t.rtt != null && <span className="text-xs font-normal text-zinc-500">· {t.rtt} ms</span>}
        </p>
        {t.error && <p className="mt-2 text-center text-sm text-red-400" data-testid="together-error">{t.error}</p>}
        {active ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              onClick={() => void disconnect()}
              data-testid="together-disconnect-btn"
              className="h-12 rounded-xl flex items-center justify-center gap-2 font-bold border-2 transition active:scale-[.99]"
              style={{ borderColor: ACCENT, color: ACCENT }}
            >
              <Unlink className="w-5 h-5" /> {t.role === 'host' ? 'Akhiri' : 'Putuskan'}
            </button>
            <button
              onClick={reconnect}
              data-testid="together-reconnect-btn"
              className="h-12 rounded-xl flex items-center justify-center gap-2 font-bold text-white transition active:scale-[.99]"
              style={{ background: ACCENT }}
            >
              <RotateCw className="w-5 h-5" /> Reconnect
            </button>
          </div>
        ) : t.status === 'error' && t.retry ? (
          <button
            onClick={reconnect}
            data-testid="together-reconnect-btn"
            className="mt-4 w-full h-12 rounded-xl flex items-center justify-center gap-2 font-bold text-white transition active:scale-[.99]"
            style={{ background: ACCENT }}
          >
            <RotateCw className="w-5 h-5" /> Reconnect
          </button>
        ) : null}
      </div>

      {!active && !mode && (
        <div className="mt-5 grid grid-cols-2 gap-3" data-testid="together-mode-picker">
          <ModeCard icon={Plus} title="Buat room" desc="Jadi host & bagikan kode ke teman" onClick={() => pick('create')} testId="together-mode-create" />
          <ModeCard icon={LogIn} title="Gabung room" desc="Masuk ke room teman dengan kode" onClick={() => pick('join')} testId="together-mode-join" />
        </div>
      )}

      {!active && mode && (
        <div className={`${card} mt-5 p-6 space-y-6`}>
          <div className="-mt-1 flex items-center gap-3">
            <button onClick={() => pick(null)} disabled={busy} aria-label="Kembali ke pilihan" data-testid="together-mode-back"
              className="w-9 h-9 -ml-2 rounded-full flex items-center justify-center hover:bg-white/10 disabled:opacity-40">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <p className="flex-1 text-[19px] font-semibold" style={{ fontFamily: SERIF }}>{joining ? 'Gabung room' : 'Buat room'}</p>
            <button onClick={() => pick(joining ? 'create' : 'join')} disabled={busy} data-testid="together-mode-switch"
              className="text-[14px] font-semibold disabled:opacity-40" style={{ color: ACCENT }}>
              {joining ? 'Buat room' : 'Gabung room'}
            </button>
          </div>
          <Field icon={User} value={name} onChange={setName} placeholder={joining ? 'Username host' : 'Username kamu'} disabled={busy} maxLength={24} testId="together-username-input" />
          {joining && <Field icon={Users} value={code} onChange={setCode} placeholder="Kode sesi" disabled={busy} upper maxLength={8} testId="together-code-input" />}
          <p className="-mt-2 text-[13px] text-zinc-500 leading-snug px-1">
            {joining
              ? 'Isi username host dan kode sesi yang sama persis dengan milik host, atau tempel pesan undangan.'
              : 'Isi username lalu tekan Buat — kode sesi akan muncul untuk dibagikan ke teman.'}
          </p>
          <button
            onClick={submit}
            disabled={!canSubmit}
            data-testid="together-submit-btn"
            className="w-full h-12 rounded-xl flex items-center justify-center gap-2 font-bold text-white transition active:scale-[.99] disabled:opacity-40"
            style={{ background: ACCENT }}
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : joining ? <LogIn className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            {busy ? 'Menghubungkan…' : joining ? 'Gabung' : 'Buat'}
          </button>
          {joining && (
            <button
              onClick={() => void paste()}
              disabled={busy}
              data-testid="together-paste-invite-btn"
              className="-mt-3 w-full h-11 rounded-xl flex items-center justify-center gap-2 font-semibold bg-white/[.07] hover:bg-white/[.1] transition active:scale-[.99] disabled:opacity-40"
            >
              <ClipboardPaste className="w-5 h-5" style={{ color: ACCENT }} /> Tempel undangan
            </button>
          )}
        </div>
      )}
      {pasteOpen && <PasteDialog onClose={() => setPasteOpen(false)} onApply={applyInvite} />}

      {active && t.role === 'host' && <HostPanel />}
      {active && t.role === 'guest' && <GuestPanel />}
      {!active && <FriendRooms onJoin={(code, host) => { setMode('join'); setCode(code); setName(host); toast(`Terisi: ${host} • ${code} — tekan Gabung`); }} />}
      {!active && t.lastRoom && <LastRoomCard />}

      <button onClick={() => navigate('/together/settings')} className={`${card} mt-5 w-full flex items-center gap-5 px-5 py-5 text-left hover:bg-white/[.05] transition`}>
        <Gear className="w-6 h-6 shrink-0" style={{ color: ACCENT }} strokeWidth={1.7} />
        <div className="flex-1 min-w-0">
          <p className="text-[18px] font-medium">Pengaturan</p>
          <p className="text-[14px] text-zinc-400">Konfigurasikan server, nama pengguna, dan lainnya</p>
        </div>
        <ArrowRight className="w-6 h-6 shrink-0" style={{ color: ACCENT }} />
      </button>
    </>
  );
}

/** Room yang sedang dibuka oleh pengguna yang kamu ikuti */
function FriendRooms({ onJoin }: { onJoin: (code: string, host: string) => void }) {
  const token = useAuth((a) => a.token);
  const navigate = useNavigate();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  useEffect(() => {
    if (!token) return;
    let stop = false;
    const load = () => loadFriends().then((f) => !stop && setFriends(f)).catch(() => !stop && setFriends((x) => x || []));
    void load();
    const iv = setInterval(load, 30_000);
    return () => { stop = true; clearInterval(iv); };
  }, [token]);
  if (!token || !friends) return null;
  const live = friends.filter((f) => f.room);
  return (
    <div data-testid="together-friend-rooms">
      <SectionTitle>Room teman ({live.length})</SectionTitle>
      <div className={`${card} divide-y divide-white/[.06]`}>
        {live.map((f) => (
          <div key={f.username} className="flex items-center gap-3 px-4 py-3">
            <div className="relative w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 text-white overflow-hidden" style={{ background: f.color || ACCENT_DEEP }}>
              {f.avatar ? <img src={f.avatar} alt="" className="w-full h-full object-cover" /> : f.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{f.name} <span className="text-xs font-normal text-zinc-500">• {f.room!.listeners} pendengar</span></p>
              <p className="text-xs text-zinc-500 truncate">{f.room!.track ? `Memutar “${f.room!.track}”` : 'Room terbuka'}</p>
            </div>
            <button onClick={() => onJoin(f.room!.code, f.room!.hostName)} data-testid="together-friend-join" className="h-9 px-4 rounded-full font-semibold text-white" style={{ background: ACCENT }}>Gabung</button>
          </div>
        ))}
        {!live.length && (
          <p className="px-4 py-4 text-center text-sm text-zinc-500">
            {friends.length ? 'Belum ada teman yang membuka room.' : <>Ikuti temanmu dari profil mereka (<button onClick={() => navigate('/search')} className="underline">cari pengguna</button>) untuk melihat room mereka di sini.</>}
          </p>
        )}
      </div>
    </div>
  );
}

function ModeCard({ icon: Icon, title, desc, onClick, testId }: { icon: LucideIcon; title: string; desc: string; onClick: () => void; testId?: string }) {
  return (
    <button onClick={onClick} data-testid={testId} className={`${card} flex flex-col items-center text-center gap-3 px-4 py-6 hover:bg-white/[.06] active:scale-[.98] transition`}>
      <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: ACCENT_DEEP }}>
        <Icon className="w-7 h-7 text-[#f6e3d9]" strokeWidth={1.8} />
      </span>
      <span className="text-[18px] font-semibold">{title}</span>
      <span className="text-[13px] text-zinc-400 leading-snug">{desc}</span>
    </button>
  );
}

/** Cadangan bila clipboard tidak bisa dibaca langsung: tempel manual */
function PasteDialog({ onClose, onApply }: { onClose: () => void; onApply: (text: string) => boolean }) {
  const [v, setV] = useState('');
  return (
    <Modal open onClose={onClose} title="Tempel undangan">
      <p className="text-sm text-zinc-400 mb-3">Tekan lama di kolom ini lalu pilih Tempel. Username host dan kode sesi akan terisi otomatis.</p>
      <textarea value={v} onChange={(e) => setV(e.target.value)} autoFocus rows={4} data-testid="together-paste-textarea"
        placeholder="Dengar musik bareng aku di Stream Beats! Username host: … • Kode sesi: …"
        className="w-full p-3 rounded-xl bg-white/[.06] border border-white/10 outline-none focus:border-[#C8643F] text-sm resize-none" />
      <button disabled={!v.trim()} data-testid="together-paste-apply-btn" onClick={() => { if (onApply(v)) onClose(); }}
        className="mt-4 w-full h-11 rounded-xl font-bold text-white disabled:opacity-40" style={{ background: ACCENT }}>Isi otomatis</button>
    </Modal>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mt-6 mb-2 px-1 text-[13px] font-semibold tracking-[.14em] uppercase text-zinc-400">{children}</h3>;
}

function MemberRow({ m, host }: { m: TogetherMember; host?: boolean }) {
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="relative w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-bold shrink-0">
        {m.name.charAt(0).toUpperCase()}
        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#161616] ${m.online ? 'bg-green-500' : 'bg-zinc-500'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">{m.name}</p>
        <p className="text-xs text-zinc-500">{m.status === 'pending' ? 'Ingin bergabung' : m.online ? 'Mendengarkan' : 'Tidak aktif'}</p>
      </div>
      {host && m.status === 'pending' && (
        <>
          <button onClick={() => void memberAction(m.id, 'approve')} aria-label="Setujui" className="w-9 h-9 rounded-full flex items-center justify-center text-white" style={{ background: ACCENT }}><Check className="w-5 h-5" /></button>
          <button onClick={() => void memberAction(m.id, 'reject')} aria-label="Tolak" className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/15"><X className="w-5 h-5" /></button>
        </>
      )}
      {host && (
        <div className="relative">
          <button onClick={() => setMenu(!menu)} aria-label="Opsi tamu" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 text-zinc-400"><Ban className="w-[18px] h-[18px]" /></button>
          {menu && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-10 z-30 w-48 rounded-xl bg-[#232323] border border-white/10 p-1 shadow-xl">
                {m.status === 'approved' && (
                  <button onClick={() => { setMenu(false); setConfirm(true); }} disabled={!m.online} data-testid="together-transfer-host"
                    className="w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-white/10 disabled:opacity-40 flex items-center gap-2">
                    <Crown className="w-4 h-4" style={{ color: ACCENT }} /> Jadikan host
                  </button>
                )}
                {m.status === 'approved' && (
                  <button onClick={() => { setMenu(false); void memberAction(m.id, 'kick'); }} className="w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-white/10">Keluarkan dari ruangan</button>
                )}
                <button onClick={() => { setMenu(false); blockMember(m); }} className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-white/10">Blokir pengguna</button>
              </div>
            </>
          )}
        </div>
      )}
      {confirm && (
        <Modal open onClose={() => setConfirm(false)} title="Ganti host">
          <p className="text-sm text-zinc-300 leading-relaxed">
            Serahkan peran host ke <b>{m.name}</b>? Ruangan tetap berjalan dengan kode yang sama. {m.name} akan mengatur lagu & antrean, dan kamu ikut mendengarkan sebagai tamu.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button onClick={() => setConfirm(false)} className="h-11 rounded-xl bg-white/[.07] hover:bg-white/[.1] font-semibold">Batal</button>
            <button disabled={busy} data-testid="together-transfer-confirm" onClick={async () => { setBusy(true); await transferHost(m); setBusy(false); setConfirm(false); }}
              className="h-11 rounded-xl font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: ACCENT }}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />} Jadikan host
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TrackRows({ tracks, max, numbered }: { tracks: Track[]; max: number; numbered?: boolean }) {
  const [all, setAll] = useState(false);
  const shown = all ? tracks : tracks.slice(0, max);
  return (
    <div className={`${card} divide-y divide-white/[.06]`}>
      {shown.map((tr, i) => (
        <div key={`${tr.videoId}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
          {numbered && <span className="w-5 text-right text-xs tabular-nums text-zinc-500 shrink-0">{i + 1}</span>}
          <Cover src={tr.thumbnail} size={96} className="w-10 h-10 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-medium truncate">{tr.title}</p>
            <p className="text-xs text-zinc-500 truncate">{artistNames(tr)}</p>
          </div>
        </div>
      ))}
      {tracks.length > max && (
        <button onClick={() => setAll(!all)} className="w-full py-3 text-sm font-semibold" style={{ color: ACCENT }}>
          {all ? 'Tampilkan lebih sedikit' : `Tampilkan semua (${tracks.length})`}
        </button>
      )}
    </div>
  );
}

/** Antrean berikutnya (sama untuk host & tamu) */
function RoomQueue({ queue, host }: { queue: Track[]; host?: boolean }) {
  return (
    <div data-testid="together-shared-queue">
      <SectionTitle><span className="inline-flex items-center gap-2"><ListMusic className="w-4 h-4" /> Antrean berikutnya ({queue.length})</span></SectionTitle>
      {queue.length ? <TrackRows tracks={queue} max={5} numbered /> : (
        <p className={`${card} px-4 py-5 text-center text-sm text-zinc-500`}>
          {host ? 'Antrean kosong. Tambahkan lagu ke antrean — semua pendengar bisa melihatnya.' : 'Host belum menambahkan lagu ke antrean.'}
        </p>
      )}
    </div>
  );
}

/** Lagu yang sudah diputar di ruangan ini */
function RoomHistory({ tracks, code }: { tracks: Track[]; code: string }) {
  if (!tracks.length) return null;
  const recent = [...tracks].reverse();
  return (
    <div data-testid="together-room-history">
      <div className="mt-6 mb-2 px-1 flex items-center">
        <h3 className="flex-1 inline-flex items-center gap-2 text-[13px] font-semibold tracking-[.14em] uppercase text-zinc-400"><History className="w-4 h-4" /> Riwayat room ({tracks.length})</h3>
        <button onClick={() => saveRoomPlaylist(tracks, code)} data-testid="together-save-history" className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: ACCENT }}>
          <ListPlus className="w-4 h-4" /> Simpan jadi playlist
        </button>
      </div>
      <TrackRows tracks={recent} max={5} />
    </div>
  );
}

function LastRoomCard() {
  const t = useTogether();
  const r = t.lastRoom!;
  const when = new Date(r.at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <div className={`${card} mt-5 p-5`} data-testid="together-last-room">
      <p className="flex items-center gap-2 text-[13px] font-semibold tracking-[.14em] uppercase text-zinc-400"><History className="w-4 h-4" /> Room terakhir</p>
      <p className="mt-2 font-semibold">Ruangan {r.code} • {r.tracks.length} lagu</p>
      <p className="text-sm text-zinc-500">Berakhir {when}</p>
      <div className="mt-3 flex -space-x-2">
        {r.tracks.slice(-6).map((tr, i) => <Cover key={i} src={tr.thumbnail} size={96} className="w-10 h-10 rounded-md ring-2 ring-[#161616]" />)}
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
        <button onClick={() => saveRoomPlaylist(r.tracks, r.code)} className="h-11 rounded-xl font-bold text-white flex items-center justify-center gap-2" style={{ background: ACCENT }}>
          <ListPlus className="w-4 h-4" /> Simpan jadi playlist
        </button>
        <button onClick={() => t.set({ lastRoom: null })} aria-label="Hapus riwayat room" className="h-11 w-11 rounded-xl bg-white/[.07] hover:bg-white/[.1] flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

function HostPanel() {
  const t = useTogether();
  const current = usePlayer((s) => s.current);
  const pending = t.members.filter((m) => m.status === 'pending');
  const guests = t.members.filter((m) => m.status === 'approved');
  const share = () => {
    const url = inviteLink(t.code, t.hostName);
    void shareLink({ url, title: 'Dengar bersama di Stream Beats', text: `Dengar musik bareng aku di Stream Beats! Username host: ${t.hostName} • Kode sesi: ${t.code}` });
  };
  return (
    <>
      <div className={`${card} mt-5 p-5`}>
        <p className="text-center text-[12px] font-semibold tracking-[.18em] text-zinc-400">KODE SESI</p>
        <p className="mt-2 text-center text-[40px] leading-none font-bold tracking-[.22em] tabular-nums select-all" style={{ color: ACCENT }} data-testid="together-session-code">{t.code}</p>
        <p className="mt-3 text-center text-sm text-zinc-400">Username host: <b className="text-zinc-200" data-testid="together-host-username">{t.hostName}</b></p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button onClick={async () => toast((await copyText(t.code)) ? 'Kode disalin' : 'Gagal menyalin')} className="h-11 rounded-xl bg-white/[.07] hover:bg-white/[.1] flex items-center justify-center gap-2 font-semibold"><Copy className="w-4 h-4" /> Salin kode</button>
          <button onClick={share} className="h-11 rounded-xl bg-white/[.07] hover:bg-white/[.1] flex items-center justify-center gap-2 font-semibold"><Share2 className="w-4 h-4" /> Undang</button>
        </div>
        <p className="mt-4 flex items-center gap-2 text-sm text-zinc-400">
          <Crown className="w-4 h-4 shrink-0" style={{ color: ACCENT }} />
          <span className="truncate">Kamu host • {current ? `memutar “${current.title}”` : 'putar lagu untuk mulai'}</span>
        </p>
      </div>

      {pending.length > 0 && (
        <>
          <SectionTitle>Permintaan bergabung ({pending.length})</SectionTitle>
          <div className={`${card} divide-y divide-white/[.06]`}>{pending.map((m) => <MemberRow key={m.id} m={m} host />)}</div>
        </>
      )}

      {t.suggestions.length > 0 && (
        <>
          <SectionTitle>Saran lagu ({t.suggestions.length})</SectionTitle>
          <div className={`${card} divide-y divide-white/[.06]`}>
            {t.suggestions.map((g) => (
              <div key={g.id} className="flex items-center gap-3 px-4 py-3">
                <Cover src={g.track.thumbnail} size={96} className="w-12 h-12 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{g.track.title}</p>
                  <p className="text-xs text-zinc-500 truncate">{artistNames(g.track)} • dari {g.byName}</p>
                </div>
                <button onClick={() => void respondSuggestion(g, true)} aria-label="Tambahkan ke antrean" className="w-9 h-9 rounded-full flex items-center justify-center text-white" style={{ background: ACCENT }}><Check className="w-5 h-5" /></button>
                <button onClick={() => void respondSuggestion(g, false)} aria-label="Tolak saran" className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/15"><X className="w-5 h-5" /></button>
              </div>
            ))}
          </div>
        </>
      )}

      <RoomQueue queue={t.queue} host />

      <SectionTitle>Pendengar ({guests.length})</SectionTitle>
      <div className={`${card} divide-y divide-white/[.06]`}>
        {guests.length ? guests.map((m) => <MemberRow key={m.id} m={m} host />) : (
          <p className="px-4 py-5 text-center text-sm text-zinc-500">Belum ada yang bergabung. Bagikan kode sesi ke teman.</p>
        )}
      </div>
      {guests.length > 0 && <p className="mt-2 px-1 text-xs text-zinc-500">Ketuk ikon di samping nama tamu untuk menjadikannya host.</p>}

      <RoomHistory tracks={t.roomHistory} code={t.code} />
    </>
  );
}

function GuestPanel() {
  const t = useTogether();
  const current = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  if (t.status === 'pending')
    return (
      <div className={`${card} mt-5 p-6 text-center`}>
        <Loader2 className="w-8 h-8 mx-auto animate-spin" style={{ color: ACCENT }} />
        <p className="mt-3 font-semibold">Menunggu {t.hostName || 'host'} menyetujui…</p>
        <p className="mt-1 text-sm text-zinc-500">Kode sesi {t.code}</p>
      </div>
    );
  return (
    <>
      <div className={`${card} mt-5 p-5`}>
        <p className="flex items-center gap-2 text-sm text-zinc-400"><Radio className="w-4 h-4" style={{ color: ACCENT }} /> Mengikuti <b className="text-zinc-200">{t.hostName}</b> • {t.code}</p>
        {current ? (
          <div className="mt-4 flex items-center gap-3">
            <Cover src={current.thumbnail} size={120} className="w-14 h-14 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{current.title}</p>
              <p className="text-sm text-zinc-400 truncate">{artistNames(current)}</p>
            </div>
            <button onClick={guestToggle} className="h-10 px-4 rounded-full font-semibold text-white" style={{ background: ACCENT }}>{playing ? 'Jeda' : 'Putar'}</button>
          </div>
        ) : (
          <p className="mt-4 flex items-center gap-2 text-sm text-zinc-500"><Music2 className="w-4 h-4" /> Host belum memutar lagu</p>
        )}
        {t.hostStale && <p className="mt-3 text-sm text-amber-400">Host sedang tidak aktif — menunggu host kembali…</p>}
        {t.localHold && <p className="mt-3 text-sm text-zinc-400">Dijeda di perangkat ini. Ketuk Putar untuk ikut host lagi.</p>}
        <p className="mt-4 text-[13px] text-zinc-500 leading-snug">Pilih lagu mana pun (atau “Tambahkan ke antrean”) untuk menyarankannya ke host.</p>
      </div>
      <SectionTitle>Pendengar ({t.members.length + 1})</SectionTitle>
      <div className={`${card} divide-y divide-white/[.06]`}>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 text-white" style={{ background: ACCENT_DEEP }}>{t.hostName.charAt(0).toUpperCase()}</div>
          <div className="flex-1 min-w-0"><p className="font-semibold truncate">{t.hostName}</p><p className="text-xs text-zinc-500">Host</p></div>
          <Crown className="w-4 h-4" style={{ color: ACCENT }} />
        </div>
        {t.members.map((m) => <MemberRow key={m.id} m={m} />)}
      </div>
      <RoomQueue queue={t.queue} />
      <RoomHistory tracks={t.roomHistory} code={t.code} />
    </>
  );
}

/* ─────────────────────────── pengaturan ─────────────────────────── */

function TogetherSettings() {
  const navigate = useNavigate();
  const t = useTogether();
  const [dlg, setDlg] = useState<null | 'blocked' | 'server' | 'name'>(null);
  const serverLabel = useMemo(() => {
    const d = DEFAULT_SERVERS.find((x) => x.url === t.serverUrl);
    if (d) return d.label;
    try { return new URL(t.serverUrl).host; } catch { return t.serverUrl; }
  }, [t.serverUrl]);
  return (
    <>
      <p className="mt-2 mb-3 px-1 text-[19px] italic text-zinc-200" style={{ fontFamily: SERIF }}>Pengaturan</p>
      <div className={`${card} divide-y divide-white/[.07] overflow-hidden`}>
        <SRow icon={UserX} title="Pengguna yang diblokir" desc={t.blocked.length ? `${t.blocked.length} pengguna diblokir` : 'Tidak ada pengguna yang diblokir'} onClick={() => setDlg('blocked')} right={t.blocked.length ? undefined : <span />} />
        <SRow icon={Cloud} title="URL Server" desc={serverLabel} onClick={() => setDlg('server')} />
        <SRow icon={User} title="Nama pengguna" desc={t.username || 'Belum diatur'} onClick={() => setDlg('name')} />
        <SRow icon={Check} title="Setujui otomatis permintaan bergabung" desc="Setujui permintaan bergabung secara otomatis tanpa meninjaunya secara manual"
          right={<Toggle on={t.autoApproveJoin} onChange={(v) => t.set({ autoApproveJoin: v })} label="Setujui otomatis permintaan bergabung" />} />
        <SRow icon={Check} title="Setujui otomatis saran lagu" desc="Secara otomatis menyetujui dan mengantrekan saran lagu dari tamu"
          right={<Toggle on={t.autoApproveSuggest} onChange={(v) => t.set({ autoApproveSuggest: v })} label="Setujui otomatis saran lagu" />} />
        <SRow icon={Eye} title="Tampilkan room ke pengikut" desc="Orang yang mengikutimu bisa melihat dan meminta bergabung ke room yang kamu buka (butuh akun)"
          right={<Toggle on={t.shareRoom} onChange={(v) => t.set({ shareRoom: v })} label="Tampilkan room ke pengikut" />} />
        <SRow icon={Volume2} title="Sinkronkan volume host" desc="Tamu akan menyesuaikan tingkat volume host"
          right={<Toggle on={t.syncVolume} onChange={(v) => t.set({ syncVolume: v })} label="Sinkronkan volume host" />} />
        <SRow icon={Bug} title="Lihat log" desc="Debug peristiwa dan pesan koneksi" onClick={() => navigate('/together/log')} />
      </div>

      <Modal open={dlg === 'blocked'} onClose={() => setDlg(null)} title="Pengguna yang diblokir">
        {t.blocked.length ? (
          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {t.blocked.map((b, i) => (
              <div key={`${b.name}-${i}`} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5">
                <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center font-bold">{b.name.charAt(0).toUpperCase()}</div>
                <div className="flex-1 min-w-0"><p className="font-semibold truncate">{b.name}</p><p className="text-xs text-zinc-500">Diblokir {new Date(b.at).toLocaleDateString('id-ID')}</p></div>
                <button onClick={() => { t.unblock(i); toast(`${b.name} tidak diblokir lagi`); }} className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-sm font-semibold">Buka blokir</button>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-zinc-400">Tidak ada pengguna yang diblokir. Blokir tamu dari daftar pendengar saat kamu menjadi host.</p>}
      </Modal>
      {dlg === 'server' && <ServerDialog onClose={() => setDlg(null)} />}
      {dlg === 'name' && <NameDialog onClose={() => setDlg(null)} />}
    </>
  );
}

function ServerDialog({ onClose }: { onClose: () => void }) {
  const t = useTogether();
  const isDefault = DEFAULT_SERVERS.some((d) => d.url === t.serverUrl);
  const [custom, setCustom] = useState(isDefault ? '' : t.serverUrl);
  const [mode, setMode] = useState<'default' | 'custom'>(isDefault ? 'default' : 'custom');
  const [test, setTest] = useState<null | { ok: boolean; msg: string } | 'busy'>(null);
  const url = mode === 'default' ? '' : custom.trim();
  const valid = mode === 'default' || /^https?:\/\/[^\s/]+/i.test(url);
  const locked = t.status === 'connected' || t.status === 'pending' || t.status === 'connecting';
  return (
    <Modal open onClose={onClose} title="URL Server">
      <div className="space-y-2">
        {DEFAULT_SERVERS.map((d) => (
          <button key={d.id} onClick={() => { setMode('default'); setTest(null); }} className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left ${mode === 'default' ? 'border-[#C8643F] bg-white/[.05]' : 'border-white/10'}`}>
            <Cloud className="w-5 h-5 shrink-0" style={{ color: ACCENT }} />
            <div className="flex-1 min-w-0"><p className="font-semibold">{d.label}</p><p className="text-xs text-zinc-500 truncate">{location.host}/api/together</p></div>
            {mode === 'default' && <Check className="w-5 h-5" style={{ color: ACCENT }} />}
          </button>
        ))}
        <button onClick={() => { setMode('custom'); setTest(null); }} className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left ${mode === 'custom' ? 'border-[#C8643F] bg-white/[.05]' : 'border-white/10'}`}>
          <Link2 className="w-5 h-5 shrink-0" style={{ color: ACCENT }} />
          <p className="flex-1 font-semibold">Server kustom</p>
          {mode === 'custom' && <Check className="w-5 h-5" style={{ color: ACCENT }} />}
        </button>
        {mode === 'custom' && (
          <input value={custom} onChange={(e) => { setCustom(e.target.value); setTest(null); }} placeholder="https://situs-stream-beats-lain.netlify.app" autoCapitalize="off" autoCorrect="off" spellCheck={false}
            className="w-full h-12 px-4 rounded-xl bg-white/[.06] border border-white/10 outline-none focus:border-[#C8643F] text-sm" />
        )}
        <p className="text-xs text-zinc-500 leading-snug">Host dan semua tamu harus memakai server yang sama. Server kustom = situs Stream Beats lain yang sudah mengisi database Upstash.</p>
        {test && test !== 'busy' && <p className={`text-sm ${test.ok ? 'text-green-400' : 'text-red-400'}`}>{test.msg}</p>}
        {locked && <p className="text-sm text-amber-400">Putuskan sesi dulu untuk mengganti server.</p>}
        <div className="flex gap-2 pt-2">
          <button disabled={!valid || test === 'busy'} onClick={async () => { setTest('busy'); setTest(await testServer(url)); }} className="flex-1 h-11 rounded-xl bg-white/10 hover:bg-white/15 font-semibold disabled:opacity-40 flex items-center justify-center gap-2">
            {test === 'busy' && <Loader2 className="w-4 h-4 animate-spin" />} Tes koneksi
          </button>
          <button disabled={!valid || locked} onClick={() => { t.set({ serverUrl: url.replace(/\/+$/, '') }); t.log(`Server diganti ke ${serverBase(url)}`); onClose(); }} className="flex-1 h-11 rounded-xl font-bold text-white disabled:opacity-40" style={{ background: ACCENT }}>Simpan</button>
        </div>
      </div>
    </Modal>
  );
}

function NameDialog({ onClose }: { onClose: () => void }) {
  const t = useTogether();
  const [v, setV] = useState(t.username);
  const ok = v.trim().length >= 2;
  return (
    <Modal open onClose={onClose} title="Nama pengguna">
      <p className="text-sm text-zinc-400 mb-3">Nama yang dilihat host dan pendengar lain.</p>
      <input value={v} onChange={(e) => setV(e.target.value)} maxLength={24} autoFocus placeholder="Username"
        className="w-full h-12 px-4 rounded-xl bg-white/[.06] border border-white/10 outline-none focus:border-[#C8643F]" />
      <button disabled={!ok} onClick={() => { t.set({ username: v.trim() }); onClose(); }} className="mt-4 w-full h-11 rounded-xl font-bold text-white disabled:opacity-40" style={{ background: ACCENT }}>Simpan</button>
    </Modal>
  );
}

/* ─────────────────────────── log ─────────────────────────── */

function TogetherLogPage() {
  const logs = useTogether((s) => s.logs);
  const clear = useTogether((s) => s.clearLogs);
  const text = () => logs.map((l) => `${new Date(l.t).toLocaleTimeString('id-ID')} [${l.level}] ${l.msg}`).join('\n');
  return (
    <>
      <div className="mt-2 flex gap-2">
        <button onClick={async () => toast((await copyText(text() || '(log kosong)')) ? 'Log disalin' : 'Gagal menyalin')} className="flex-1 h-10 rounded-xl bg-white/[.07] hover:bg-white/[.1] font-semibold flex items-center justify-center gap-2"><Copy className="w-4 h-4" /> Salin</button>
        <button onClick={clear} className="flex-1 h-10 rounded-xl bg-white/[.07] hover:bg-white/[.1] font-semibold flex items-center justify-center gap-2"><Trash2 className="w-4 h-4" /> Bersihkan</button>
      </div>
      <div className={`${card} mt-4 p-3 font-mono text-[12px] leading-relaxed max-h-[70vh] overflow-y-auto`}>
        {logs.length ? [...logs].reverse().map((l, i) => (
          <p key={`${l.t}-${i}`} className={l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-amber-400' : 'text-zinc-300'}>
            <span className="text-zinc-500">{new Date(l.t).toLocaleTimeString('id-ID')}</span> {l.msg}
          </p>
        )) : <p className="text-zinc-500 text-center py-6 font-sans text-sm">Belum ada peristiwa. Log muncul setelah kamu menghubungkan.</p>}
      </div>
    </>
  );
}

/* ─────────────────────────── rute ─────────────────────────── */

export default function Together() {
  const navigate = useNavigate();
  const { section } = useParams();
  const back = (to: string) => () => (window.history.length > 1 ? navigate(-1) : navigate(to));
  useEffect(() => { document.getElementById('main-scroll')?.scrollTo(0, 0); }, [section]);
  if (section === 'settings')
    return (
      <div className="px-4 lg:px-6 pb-8 max-w-2xl">
        <Header title="Dengar bersama" onBack={back('/together')} />
        <TogetherSettings />
      </div>
    );
  if (section === 'log')
    return (
      <div className="px-4 lg:px-6 pb-8 max-w-2xl">
        <Header title="Log koneksi" onBack={back('/together/settings')} />
        <TogetherLogPage />
      </div>
    );
  return (
    <div className="px-4 lg:px-6 pb-8 max-w-2xl">
      <Header title="Bersama" onBack={back('/library')} />
      <TogetherHome />
    </div>
  );
}
