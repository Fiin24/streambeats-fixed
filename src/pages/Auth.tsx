import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, Eye, EyeOff, Loader2, AtSign, Lock, User, ShieldAlert, Check, X, Music2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { authApi, AuthError, type Session } from '../lib/authApi';
import { useAuth, firstName } from '../store/auth';
import { useTaste } from '../store/taste';
import { syncNow, switchAccount, restoreLastPlayed } from '../lib/sync';
import { usePlayer } from '../store/player';
import { toast } from '../lib/toast';
import { startGoogleSignIn, takeGoogleResultFromUrl, onNativeGoogleResult, type GoogleResult } from '../lib/googleAuth';

type View = 'welcome' | 'register' | 'login';

/** Akun yang pernah masuk di perangkat ini → kembali dengan sekali ketuk */
function SavedAccounts() {
  const navigate = useNavigate();
  const accounts = useAuth((s) => s.accounts);
  const [busy, setBusy] = useState<string | null>(null);
  if (!accounts.length) return null;
  return (
    <div className="pt-4">
      <p className="text-xs font-semibold text-zinc-500 mb-2">Akun di perangkat ini</p>
      <div className="space-y-1.5">
        {[...accounts].sort((a, b) => b.lastUsed - a.lastUsed).map((a) => (
          <button
            key={a.user.uid}
            disabled={!!busy}
            onClick={async () => { setBusy(a.user.uid); const ok = await switchAccount(a.user.uid); setBusy(null); if (ok) navigate('/', { replace: true }); }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[.06] hover:bg-white/[.1] text-left disabled:opacity-60"
          >
            <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-black shrink-0 overflow-hidden" style={{ background: a.user.color || '#FA243C' }}>
              {a.user.avatar ? <img src={a.user.avatar} alt="" className="w-full h-full object-cover" /> : (a.user.name || '?')[0].toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{a.user.name}</span>
              <span className="block truncate text-xs text-zinc-400">{a.user.username ? `@${a.user.username}` : a.user.email}</span>
            </span>
            {busy === a.user.uid && <Loader2 className="w-4 h-4 animate-spin" />}
          </button>
        ))}
      </div>
    </div>
  );
}

/** sama dengan aturan server: 3–20 karakter, huruf kecil/angka/titik/garis bawah */
const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._]{1,18})[a-z0-9]$/;
const normUser = (u: string) => u.trim().replace(/^@/, '').toLowerCase();
const usernameOk = (u: string) => USERNAME_RE.test(u) && !/[._]{2}/.test(u);
const pwOk = (pw: string) => pw.length >= 8 && /[A-Za-z]/.test(pw) && /\d/.test(pw);

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const lvl = pw ? Math.min(4, Math.max(1, s - (/[A-Za-z]/.test(pw) && /\d/.test(pw) ? 0 : 1))) : 0;
  return { lvl, label: ['', 'Lemah', 'Cukup', 'Kuat', 'Sangat kuat'][lvl], color: ['', '#FA243C', '#EDB200', '#FA243C', '#FF4458'][lvl] };
}

function useCountdown(until: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (until <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [until]);
  return Math.max(0, Math.ceil((until - now) / 1000));
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function Field({ icon, label, children, hint }: { icon: ReactNode; label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-zinc-300">{label}</span>
      <div className="mt-1.5 relative flex items-center">
        <span className="absolute left-3.5 text-zinc-500 pointer-events-none">{icon}</span>
        {children}
      </div>
      {hint}
    </label>
  );
}
const inputCls = 'w-full h-12 rounded-xl bg-white/[.06] border border-white/10 pl-11 pr-11 text-[15px] outline-none transition placeholder:text-zinc-600 focus:border-spotify focus:bg-white/[.09]';

function PasswordInput({ value, onChange, autoComplete, placeholder = 'Minimal 8 karakter', disabled }: { value: string; onChange: (v: string) => void; autoComplete: string; placeholder?: string; disabled?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <>
      <input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} placeholder={placeholder} disabled={disabled} className={`${inputCls} disabled:opacity-50 disabled:cursor-not-allowed`} required />
      <button type="button" disabled={disabled} onClick={() => setShow(!show)} aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'} className="absolute right-2 w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-white">
        {show ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
      </button>
    </>
  );
}

function Strength({ pw }: { pw: string }) {
  const s = strength(pw);
  const rules = [[pw.length >= 8, 'Minimal 8 karakter'], [/[A-Za-z]/.test(pw) && /\d/.test(pw), 'Huruf dan angka']] as const;
  if (!pw) return <p className="mt-1.5 text-xs text-zinc-500">Gunakan minimal 8 karakter dengan huruf dan angka.</p>;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="flex-1 grid grid-cols-4 gap-1">
          {[1, 2, 3, 4].map((i) => <span key={i} className="h-1 rounded-full transition-colors" style={{ background: i <= s.lvl ? s.color : 'rgb(255 255 255 / .1)' }} />)}
        </div>
        <span className="text-xs font-semibold w-20 text-right" style={{ color: s.color }}>{s.label}</span>
      </div>
      <div className="flex gap-3 text-xs">
        {rules.map(([ok, t]) => (
          <span key={t} className={`flex items-center gap-1 ${ok ? 'text-spotify' : 'text-zinc-500'}`}><Check className="w-3.5 h-3.5" strokeWidth={3} />{t}</span>
        ))}
      </div>
    </div>
  );
}

function Primary({ children, loading, disabled, type = 'submit', onClick }: { children: ReactNode; loading?: boolean; disabled?: boolean; type?: 'submit' | 'button'; onClick?: () => void }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} className="w-full h-12 rounded-full bg-spotify text-white font-bold text-[15px] flex items-center justify-center gap-2 hover:bg-spotify-light active:scale-[.98] transition disabled:opacity-50 disabled:active:scale-100">
      {loading && <Loader2 className="w-5 h-5 animate-spin" />}
      {children}
    </button>
  );
}

/** logo "G" resmi Google */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-5 h-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function GoogleButton({ onClick, loading, label = 'Lanjutkan dengan Google' }: { onClick: () => void; loading?: boolean; label?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={loading} className="w-full h-12 rounded-full bg-white text-black font-bold text-[15px] flex items-center justify-center gap-3 hover:bg-zinc-200 active:scale-[.98] transition disabled:opacity-60 disabled:active:scale-100">
      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <GoogleLogo />}
      {label}
    </button>
  );
}

function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-zinc-500">
      <span className="flex-1 h-px bg-white/10" /> atau <span className="flex-1 h-px bg-white/10" />
    </div>
  );
}

function ErrorBox({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <div role="alert" className="rounded-xl bg-brand/15 border border-brand/30 text-[#ff8a95] text-sm px-3.5 py-2.5">{msg}</div>;
}

export default function Auth() {
  const status = useAuth((s) => s.status);
  const continueAsGuest = useAuth((s) => s.continueAsGuest);
  const [view, setView] = useState<View>('welcome');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  /** pembekuan input password: berlaku untuk username tertentu sampai waktu tertentu */
  const [lock, setLock] = useState<{ user: string; until: number } | null>(null);
  const [avail, setAvail] = useState<{ user: string; ok: boolean; reason?: string } | null>(null);
  const [gBusy, setGBusy] = useState(false);
  const googleOn = !!status?.google;
  const lockIn = useCountdown(lock?.until || 0);

  const uname = normUser(username);
  const locked = !!lock && lock.user === uname && lockIn > 0;
  const maxAttempts = status?.maxAttempts || 3;
  const lockMinutes = status?.lockMinutes || 5;

  const go = (v: View) => { setErr(null); setLeft(null); setPw(''); setPw2(''); setView(v); };

  // hapus pesan "dibekukan" begitu waktunya habis
  useEffect(() => { if (lock && lockIn === 0) { setLock(null); setErr(null); } }, [lockIn]); // eslint-disable-line
  // username berganti → sisa percobaan untuk username sebelumnya tidak relevan lagi
  useEffect(() => { setLeft(null); }, [uname]);

  // cek ketersediaan username saat mengetik di form daftar (jeda 400 ms)
  useEffect(() => {
    if (view !== 'register' || !usernameOk(uname)) { setAvail(null); return; }
    const id = setTimeout(async () => {
      try {
        const r = await authApi<{ available: boolean; reason?: string }>('check-username', { username: uname }, null, 8000);
        setAvail({ user: uname, ok: r.available, reason: r.reason });
      } catch { setAvail(null); }
    }, 400);
    return () => clearTimeout(id);
  }, [uname, view]);

  const finish = async (s: Session, msg: string) => {
    // ambil selera musik dari akun dulu agar layar pilih genre tidak muncul lagi di perangkat baru
    try {
      const remote = await authApi<{ data: { taste?: any } | null }>('sync', undefined, s.token);
      if (remote.data?.taste?.done) useTaste.setState((st) => ({ byUser: { ...st.byUser, [s.user.uid]: remote.data!.taste } }));
    } catch { /* lanjut, disinkronkan nanti */ }
    useAuth.getState().setSession(s.token, s.user);
    // masuk ke akun (mis. lewat "Tambah akun"): siapkan lagu terakhir akun itu tanpa diputar
    void syncNow().then(() => { if (!usePlayer.getState().current) restoreLastPlayed(); });
    toast(msg.replace('{name}', firstName(s.user.name)));
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try { await fn(); } catch (e: any) {
      const ae = e as AuthError;
      setErr(ae.message || 'Terjadi kesalahan');
    } finally { setBusy(false); }
  };

  /** hasil login Google (dari URL web atau deep link APK) → tukar kode sekali pakai menjadi sesi */
  const handleGoogle = (r: GoogleResult) => {
    if ('error' in r) { setErr(r.error); setGBusy(false); return; }
    setGBusy(true);
    void run(async () => {
      try {
        const s = await authApi<Session>('google-exchange', { code: r.code });
        await finish(s, s.created ? 'Akun dibuat dengan Google. Selamat datang, {name}!' : 'Selamat datang kembali, {name}!');
      } finally { setGBusy(false); }
    });
  };
  useEffect(() => {
    const fromUrl = takeGoogleResultFromUrl();
    if (fromUrl) handleGoogle(fromUrl);
    return onNativeGoogleResult(handleGoogle);
  }, []); // eslint-disable-line

  const google = async () => {
    setErr(null);
    setGBusy(true);
    try {
      await startGoogleSignIn();
      // web: halaman pindah ke Google. APK: Chrome terbuka; tombol aktif lagi bila pengguna kembali tanpa login
      setTimeout(() => setGBusy(false), 4000);
    } catch (e: any) {
      setErr(e?.message || 'Gagal membuka login Google');
      setGBusy(false);
    }
  };

  const submitRegister = (e: FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) { setErr('Konfirmasi password tidak sama'); return; }
    void run(async () => {
      const s = await authApi<Session>('register', { name, username: uname, password: pw, confirm: pw2 });
      await finish(s, 'Akun dibuat. Selamat datang, {name}!');
    });
  };

  const submitLogin = (e: FormEvent) => {
    e.preventDefault();
    if (locked) return;
    void run(async () => {
      try {
        const s = await authApi<Session>('login', { username: uname, password: pw });
        setLeft(null);
        await finish(s, 'Selamat datang kembali, {name}!');
      } catch (e) {
        if (e instanceof AuthError) {
          setPw('');
          if (e.data.locked && e.data.lockedFor) {
            setLock({ user: uname, until: Date.now() + Number(e.data.lockedFor) * 1000 });
            setLeft(null);
          } else if (typeof e.data.attemptsLeft === 'number') {
            setLeft(e.data.attemptsLeft);
          }
        }
        throw e;
      }
    });
  };

  const back = useMemo(() => ({ register: 'welcome', login: 'welcome', welcome: null }[view] as View | null), [view]);
  const pwMismatch = !!pw2 && pw !== pw2;
  const unameTaken = avail?.user === uname && !avail.ok;

  return (
    <div className="min-h-[100dvh] bg-black text-white relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-32 w-[480px] h-[480px] rounded-full bg-spotify/25 blur-[120px]" />
        <div className="absolute -bottom-48 -right-24 w-[520px] h-[520px] rounded-full bg-brand/20 blur-[130px]" />
      </div>

      <div className="relative min-h-[100dvh] flex flex-col max-w-[420px] mx-auto px-6 pt-[max(env(safe-area-inset-top),20px)] pb-[max(env(safe-area-inset-bottom),24px)]">
        <div className="h-12 flex items-center">
          {back && (
            <button onClick={() => go(back)} aria-label="Kembali" className="-ml-2 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10">
              <ArrowLeft className="w-6 h-6" />
            </button>
          )}
        </div>

        {view === 'welcome' && (
          <div className="flex-1 flex flex-col animate-fade-in">
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="relative">
                <span className="absolute inset-0 rounded-[30px] bg-spotify/40 blur-2xl" />
                <img src="/icon.svg" alt="" className="relative w-24 h-24 rounded-[28px] shadow-2xl" />
              </div>
              <h1 className="mt-8 text-[34px] leading-[1.1] font-extrabold tracking-tight">Jutaan lagu.<br />Gratis di Stream Beats.</h1>
              <p className="mt-3 text-zinc-400">Tanpa iklan, lirik tersinkron, unduh untuk offline, dan pustaka yang ikut ke semua perangkatmu.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-zinc-300">
                {['Tanpa iklan', 'Sinkron antarperangkat', 'Statistik mendengarkan', 'Offline'].map((t) => (
                  <span key={t} className="px-3 py-1 rounded-full bg-white/[.07] border border-white/10">{t}</span>
                ))}
              </div>
            </div>
            <div className="space-y-3 pt-8">
              {err && <ErrorBox msg={err} />}
              {googleOn && <GoogleButton onClick={google} loading={gBusy} />}
              <Primary type="button" onClick={() => go('register')}>{googleOn ? 'Daftar dengan username' : 'Daftar gratis'}</Primary>
              <button onClick={() => go('login')} className="w-full h-12 rounded-full border border-white/30 font-bold hover:border-white transition">Masuk</button>
              <button onClick={continueAsGuest} className="w-full h-12 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold transition">Lanjut tanpa akun (Tamu)</button>
              <SavedAccounts />
            </div>
          </div>
        )}

        {view === 'register' && (
          <form onSubmit={submitRegister} className="flex-1 flex flex-col animate-fade-in" noValidate>
            <h1 className="text-[28px] font-extrabold tracking-tight">Buat akun</h1>
            <p className="mt-1 text-zinc-400 text-sm">Cukup nama, username, dan password — langsung bisa dipakai.</p>
            {googleOn && (
              <div className="mt-6 space-y-4">
                <GoogleButton onClick={google} loading={gBusy} label="Daftar dengan Google" />
                <OrDivider />
              </div>
            )}
            <div className={googleOn ? 'mt-4 space-y-4' : 'mt-7 space-y-4'}>
              <Field icon={<User className="w-[18px] h-[18px]" />} label="Nama">
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Nama kamu" maxLength={40} className={inputCls} required />
              </Field>
              <Field
                icon={<AtSign className="w-[18px] h-[18px]" />}
                label="Username"
                hint={
                  !uname ? <p className="mt-1.5 text-xs text-zinc-500">3–20 karakter: huruf kecil, angka, titik (.) atau garis bawah (_).</p>
                  : !usernameOk(uname) ? <p className="mt-1.5 text-xs text-[#ff8a95]">Username 3–20 karakter, hanya huruf, angka, titik & garis bawah (tidak diawali/diakhiri simbol).</p>
                  : unameTaken ? <p className="mt-1.5 text-xs text-[#ff8a95] flex items-center gap-1"><X className="w-3.5 h-3.5" strokeWidth={3} />{avail?.reason || 'Username sudah dipakai'}</p>
                  : avail?.user === uname && avail.ok ? <p className="mt-1.5 text-xs text-spotify flex items-center gap-1"><Check className="w-3.5 h-3.5" strokeWidth={3} />Username tersedia</p>
                  : null
                }
              >
                <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="contoh: andi.music" maxLength={21} className={inputCls} required />
              </Field>
              <Field icon={<Lock className="w-[18px] h-[18px]" />} label="Password" hint={<Strength pw={pw} />}>
                <PasswordInput value={pw} onChange={setPw} autoComplete="new-password" />
              </Field>
              <Field
                icon={<Lock className="w-[18px] h-[18px]" />}
                label="Ulangi password"
                hint={pwMismatch ? <p className="mt-1.5 text-xs text-[#ff8a95]">Password tidak sama</p> : null}
              >
                <PasswordInput value={pw2} onChange={setPw2} autoComplete="new-password" placeholder="Ketik ulang password" />
              </Field>
              <ErrorBox msg={err} />
            </div>
            <div className="mt-auto pt-8 space-y-4">
              <Primary loading={busy} disabled={name.trim().length < 2 || !usernameOk(uname) || unameTaken || !pwOk(pw) || pw !== pw2}>Buat akun</Primary>
              <p className="text-center text-sm text-zinc-400">Sudah punya akun? <button type="button" onClick={() => go('login')} className="font-bold text-white hover:underline">Masuk</button></p>
            </div>
          </form>
        )}

        {view === 'login' && (
          <form onSubmit={submitLogin} className="flex-1 flex flex-col animate-fade-in" noValidate>
            <h1 className="text-[28px] font-extrabold tracking-tight">Masuk</h1>
            <p className="mt-1 text-zinc-400 text-sm">Lanjutkan mendengarkan dengan pustaka kamu.</p>
            {googleOn && (
              <div className="mt-6 space-y-4">
                <GoogleButton onClick={google} loading={gBusy} label="Masuk dengan Google" />
                <OrDivider />
              </div>
            )}
            <div className={googleOn ? 'mt-4 space-y-4' : 'mt-7 space-y-4'}>
              <Field icon={<AtSign className="w-[18px] h-[18px]" />} label="Username">
                <input value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="username" className={inputCls} required />
              </Field>
              <Field icon={<Lock className="w-[18px] h-[18px]" />} label="Password">
                <PasswordInput value={pw} onChange={setPw} autoComplete="current-password" placeholder={locked ? 'Dibekukan sementara' : 'Password'} disabled={locked} />
              </Field>
              {locked ? (
                <div role="alert" className="rounded-xl bg-brand/15 border border-brand/30 px-3.5 py-3 flex gap-3">
                  <ShieldAlert className="w-5 h-5 text-[#ff8a95] shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-bold text-[#ff8a95]">Input password dibekukan</p>
                    <p className="text-zinc-300 mt-0.5">Terlalu banyak percobaan salah untuk akun ini. Coba lagi dalam <b className="text-white tabular-nums">{mmss(lockIn)}</b>.</p>
                  </div>
                </div>
              ) : (
                <>
                  <ErrorBox msg={err} />
                  {left === null && !err && (
                    <p className="text-xs text-zinc-500">Demi keamanan, salah password {maxAttempts}x akan membekukan input password selama {lockMinutes} menit.</p>
                  )}
                </>
              )}
            </div>
            <div className="mt-auto pt-8 space-y-4">
              <Primary loading={busy} disabled={!uname || !pw || locked}>{locked ? `Coba lagi dalam ${mmss(lockIn)}` : 'Masuk'}</Primary>
              <p className="text-center text-sm text-zinc-400">Belum punya akun? <button type="button" onClick={() => go('register')} className="font-bold text-white hover:underline">Daftar gratis</button></p>
            </div>
          </form>
        )}

        <p className="pt-6 text-center text-[11px] text-zinc-600 flex items-center justify-center gap-1.5"><Music2 className="w-3.5 h-3.5" /> Stream Beats • Musik gratis tanpa iklan</p>
      </div>
    </div>
  );
}
