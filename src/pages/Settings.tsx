import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ChevronRight, Palette, Play, Languages, Sparkles, Download, Bell, HardDrive, History,
  Smartphone, Keyboard, Info, UserRound, Users, Trash2, Send, Music2, Instagram, Youtube, Github, Facebook, Twitter, Globe, type LucideIcon,
} from 'lucide-react';
import { useSettings } from '../store/settings';
import { usePlayer } from '../store/player';
import { crossfadeSupported } from '../lib/engine';
import { SlidersHorizontal } from 'lucide-react';
import { EQ_BANDS, EQ_LABELS, EQ_PRESETS } from '../lib/audioFx';
import { networkTypeKnown } from '../lib/dataSaver';
import type { DataSaver } from '../store/settings';
import { usePwa, promptInstall, isIOS, clearOfflineCache, storageUsed } from '../lib/pwa';
import { toast } from '../lib/toast';
import { useAuth } from '../store/auth';
import { useTaste } from '../store/taste';
import { isNativeApp } from '../lib/native';
import { genreById } from '../lib/genres';
import { img } from '../lib/img';
import AccountSettings from '../components/AccountSettings';
import Avatar from '../components/Avatar';
import { testMirrors } from '../lib/altSources';
import { useReleases } from '../store/releases';
import { useFollows } from '../store/follows';
import { useDownloads, fmtBytes } from '../store/downloads';
import { DEVELOPER, SOCIALS, APP_BADGE, APP_NAME, ABOUT_ACCENT, type SocialIcon } from '../config/about';
import { SERIF } from '../lib/fonts';
import { useTogether } from '../store/together';
import { version as APP_VERSION } from '../../package.json';

const LANGS = [['id', 'Bahasa Indonesia'], ['en', 'English'], ['ms', 'Bahasa Melayu'], ['jv', 'Basa Jawa'], ['ja', '日本語'], ['ko', '한국어']];
const REGIONS = [['ID', 'Indonesia'], ['MY', 'Malaysia'], ['SG', 'Singapura'], ['US', 'Amerika Serikat'], ['JP', 'Jepang'], ['KR', 'Korea Selatan'], ['GB', 'Inggris']];
const SHORTCUTS: [string, string][] = [
  ['Spasi', 'Putar / jeda'],
  ['Shift + → / ←', 'Lagu berikut / sebelum'],
  ['→ / ←', 'Maju / mundur 5 detik'],
  ['Ctrl + ↑ / ↓', 'Volume naik / turun'],
  ['M', 'Bisukan'],
  ['S', 'Acak (mati / acak / cerdas)'],
  ['R', 'Ulangi (mati / semua / satu)'],
  ['L', 'Lirik layar penuh'],
  ['Q', 'Antrean'],
  ['F', 'Layar penuh'],
];
const label = (list: string[][], v: string) => list.find(([k]) => k === v)?.[1] || v;

/* ------------------------------ komponen dasar ------------------------------ */

function Header({ title, onBack, serif }: { title: string; onBack: () => void; serif?: boolean }) {
  return (
    <div className="sticky top-0 z-10 -mx-4 lg:-mx-6 px-2 lg:px-4 pt-[max(env(safe-area-inset-top),10px)] lg:pt-4 pb-2 bg-[#0a0a0a]/90 lg:bg-panel/90 backdrop-blur-md flex items-center gap-2">
      <button onClick={onBack} aria-label="Kembali" className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-white/10 active:scale-95 transition">
        <ArrowLeft className="w-6 h-6" />
      </button>
      <h1 className={serif ? 'text-[26px] font-semibold' : 'text-[22px] font-bold'} style={serif ? { fontFamily: SERIF } : undefined}>{title}</h1>
    </div>
  );
}

/** Kelompok berjudul dengan kartu membulat (gaya daftar pengaturan Android modern) */
function Group({ title, children, note }: { title?: string; children: ReactNode; note?: ReactNode }) {
  return (
    <section className="mt-5">
      {title && <h2 className="px-1 mb-2 text-[13px] font-semibold text-zinc-400">{title}</h2>}
      <div className="rounded-2xl bg-white/[.045] border border-white/[.06] divide-y divide-white/[.06] overflow-hidden">{children}</div>
      {note && <p className="px-1 mt-2 text-xs text-zinc-500 leading-relaxed">{note}</p>}
    </section>
  );
}

/** Baris menu yang membuka sub-halaman */
function NavRow({ icon: Icon, title, value, onClick }: { icon: LucideIcon; title: string; value?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-4 px-4 py-3.5 text-left hover:bg-white/[.04] active:bg-white/[.07] transition">
      <Icon className="w-[22px] h-[22px] text-zinc-300 shrink-0" strokeWidth={1.8} />
      <span className="flex-1 min-w-0 font-semibold truncate">{title}</span>
      {value && <span className="text-sm text-zinc-500 truncate max-w-[40%]">{value}</span>}
      <ChevronRight className="w-5 h-5 text-zinc-500 shrink-0" />
    </button>
  );
}

/** Baris pengaturan: judul, keterangan singkat, kontrol di kanan */
function Row({ title, desc, children }: { title: string; desc?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3.5">
      <div className="flex-1 min-w-0">
        <p className="font-semibold">{title}</p>
        {desc && <p className="text-[13px] text-zinc-400 leading-snug mt-0.5">{desc}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

function Switch({ on, onChange, label: aria }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={aria} onClick={() => onChange(!on)} className={`w-12 h-7 rounded-full p-1 transition ${on ? 'bg-brand' : 'bg-zinc-600'}`}>
      <span className={`block w-5 h-5 rounded-full bg-white shadow transition ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}

const pill = 'px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-sm font-semibold transition disabled:opacity-40';
const select = 'bg-white/10 rounded-full pl-3 pr-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-white/40 max-w-[160px]';

/* -------------------------------- sub-halaman -------------------------------- */

function AccountPage() {
  return (
    <Group>
      <div className="px-4 [&>div:last-child]:border-b-0">
        <AccountSettings />
      </div>
    </Group>
  );
}

function AppearancePage() {
  const s = useSettings();
  return (
    <Group title="Tampilan">
      <Row title="Liquid glass" desc="Player & navigasi transparan seperti kaca. Matikan bila HP terasa berat.">
        <Switch on={s.glass} onChange={(glass) => s.set({ glass })} label="Liquid glass" />
      </Row>
    </Group>
  );
}

function PlaybackPage() {
  const s = useSettings();
  const cf = crossfadeSupported();
  return (
    <Group title="Pemutaran">
      <Row title="Radio otomatis" desc="Lanjut dengan lagu serupa setelah antrean habis">
        <Switch on={s.autoplayRadio} onChange={(autoplayRadio) => s.set({ autoplayRadio })} label="Radio otomatis" />
      </Row>
      <Row title="Putar di latar belakang" desc={isNativeApp() ? 'Tetap berjalan saat aplikasi diminimalkan / layar dikunci' : 'Paling stabil di versi APK'}>
        <Switch on={s.bgPlay} onChange={(bgPlay) => s.set({ bgPlay })} label="Putar di latar belakang" />
      </Row>
      <Row title="Lirik di dynamic island" desc="Baris lirik yang sedang dinyanyikan muncul di notifikasi, layar kunci & dynamic island (APK). Ketuk untuk membuka lirik.">
        <Switch on={s.islandLyrics} onChange={(islandLyrics) => s.set({ islandLyrics })} label="Lirik di dynamic island" />
      </Row>
      <div className={`px-4 py-3.5 ${cf ? '' : 'opacity-40 pointer-events-none'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">Crossfade</p>
            <p className="text-[13px] text-zinc-400">Transisi halus antarlagu tanpa hening</p>
          </div>
          <span className="text-sm font-semibold tabular-nums px-2.5 py-1 rounded-md bg-white/10 text-zinc-200">
            {s.crossfade ? `${s.crossfade} detik` : 'Mati'}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={12}
          step={1}
          value={s.crossfade}
          onChange={(e) => s.set({ crossfade: +e.target.value })}
          aria-label="Durasi crossfade"
          className="w-full mt-3 accent-[#FA243C]"
        />
        <div className="flex justify-between gap-1.5 mt-2">
          {[
            { val: 0, label: 'Mati' },
            { val: 3, label: '3 dtk' },
            { val: 6, label: '6 dtk' },
            { val: 10, label: '10 dtk' },
            { val: 12, label: '12 dtk' },
          ].map((preset) => (
            <button
              key={preset.val}
              type="button"
              onClick={() => s.set({ crossfade: preset.val })}
              className={`flex-1 py-1 text-xs rounded-lg transition ${
                s.crossfade === preset.val
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {!cf && <p className="text-[13px] text-zinc-400 mt-2">Tidak tersedia di iPhone/iPad.</p>}
      </div>
      <DataSaverRow />
    </Group>
  );
}

const SAVER: [DataSaver, string][] = [['off', 'Mati'], ['cellular', 'Data seluler'], ['always', 'Selalu']];

function DataSaverRow() {
  const s = useSettings();
  return (
    <div className="px-4 py-3.5">
      <p className="font-semibold">Hemat data</p>
      <p className="text-[13px] text-zinc-400 leading-snug mt-0.5">
        Kualitas streaming terendah, sampul lebih kecil, tanpa crossfade, dan unduhan bitrate rendah.
        {s.dataSaver === 'cellular' && !networkTypeKnown() && ' Perangkat ini tidak memberi tahu jenis jaringan, jadi hanya aktif saat koneksi lambat.'}
      </p>
      <div role="radiogroup" aria-label="Hemat data" className="mt-3 grid grid-cols-3 p-1 rounded-xl bg-black/40 border border-white/[.06]">
        {SAVER.map(([v, l]) => (
          <button key={v} role="radio" aria-checked={s.dataSaver === v} onClick={() => s.set({ dataSaver: v })}
            className={`h-9 rounded-lg text-sm transition ${s.dataSaver === v ? 'bg-white text-black font-semibold' : 'text-zinc-300 hover:text-white'}`}>{l}</button>
        ))}
      </div>
    </div>
  );
}

function SoundPage() {
  const s = useSettings();
  const setBand = (i: number, v: number) => {
    const eqGains = s.eqGains.map((g, k) => (k === i ? v : g));
    const p = EQ_PRESETS.find((x) => x.gains.every((g, k) => g === eqGains[k]));
    s.set({ eqGains, eqPreset: p?.id || 'custom', eqOn: true });
  };
  return (
    <>
      <Group title="Equalizer" note="Saat equalizer atau normalisasi aktif, lagu langsung diputar, lalu otomatis berpindah ke audio yang diolah di perangkat begitu siap (beberapa detik). Lagu berikutnya di antrean disiapkan lebih dulu, dan lagu yang sudah diunduh langsung diolah.">
        <Row title="Aktifkan equalizer">
          <Switch on={s.eqOn} onChange={(eqOn) => s.set({ eqOn })} label="Equalizer" />
        </Row>
        <div className={`px-4 py-4 transition ${s.eqOn ? '' : 'opacity-45'}`}>
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-4">
            {EQ_PRESETS.map((p) => (
              <button key={p.id} onClick={() => s.set({ eqPreset: p.id, eqGains: p.gains, eqOn: true })} aria-pressed={s.eqPreset === p.id}
                className={`shrink-0 px-3.5 h-8 rounded-full text-sm border transition ${s.eqPreset === p.id ? 'bg-white text-black border-white font-semibold' : 'border-white/15 text-zinc-300 hover:border-white/40'}`}>{p.name}</button>
            ))}
            {s.eqPreset === 'custom' && <span className="shrink-0 px-3.5 h-8 rounded-full text-sm bg-white text-black font-semibold flex items-center">Kustom</span>}
          </div>
          <div className="grid grid-cols-5 gap-2" data-testid="eq-bands">
            {EQ_BANDS.map((f, i) => (
              <div key={f} className="flex flex-col items-center gap-2">
                <span className="text-xs tabular-nums text-zinc-300 h-4">{s.eqGains[i] > 0 ? '+' : ''}{s.eqGains[i]}</span>
                <div className="relative h-36 w-full flex justify-center">
                  <span className="absolute top-1/2 inset-x-2 h-px bg-white/10" />
                  <input type="range" min={-12} max={12} step={1} value={s.eqGains[i]} onChange={(e) => setBand(i, +e.target.value)}
                    aria-label={`${EQ_LABELS[i]} Hz`}
                    className="eq-slider absolute top-1/2 left-1/2 w-36 -translate-x-1/2 -translate-y-1/2 -rotate-90" />
                </div>
                <span className="text-[11px] text-zinc-500 tabular-nums">{EQ_LABELS[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </Group>
      <Group title="Volume">
        <Row title="Normalisasi volume" desc="Ratakan lagu yang terlalu pelan atau terlalu keras">
          <Switch on={s.normalize} onChange={(normalize) => s.set({ normalize })} label="Normalisasi volume" />
        </Row>
      </Group>
    </>
  );
}

function ContentPage() {
  const s = useSettings();
  const applied = () => toast('Muat ulang beranda untuk menerapkan');
  return (
    <Group title="Konten" note="Menentukan bahasa judul, tangga lagu & lagu yang tersedia.">
      <Row title="Bahasa">
        <select className={select} value={s.hl} onChange={(e) => { s.set({ hl: e.target.value }); applied(); }}>
          {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Row>
      <Row title="Wilayah">
        <select className={select} value={s.gl} onChange={(e) => { s.set({ gl: e.target.value }); applied(); }}>
          {REGIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Row>
    </Group>
  );
}

function TastePage() {
  const user = useAuth((s) => s.user);
  const taste = useTaste((s) => s.byUser[user.uid]);
  const reopen = useTaste((s) => s.reopen);
  const genres = (taste?.genres || []).map((g) => genreById(g)?.name).filter(Boolean);
  return (
    <Group title="Selera musik">
      <Row title="Genre & artis favorit" desc={taste ? `${genres.slice(0, 4).join(', ')}${genres.length > 4 ? ` +${genres.length - 4}` : ''} • ${taste.artists.length} artis` : 'Belum dipilih'}>
        <button onClick={() => reopen(user.uid)} className={`${pill} flex items-center gap-1.5`}><Sparkles className="w-4 h-4" /> Ubah</button>
      </Row>
      {!!taste?.artists.length && (
        <div className="flex -space-x-2 px-4 py-3">
          {taste.artists.slice(0, 10).map((a) => (
            <img key={a.id} src={img(a.thumbnail, 96)} alt="" referrerPolicy="no-referrer" crossOrigin="anonymous" title={a.name} className="w-9 h-9 rounded-full object-cover ring-2 ring-[#151515] bg-zinc-800" />
          ))}
        </div>
      )}
    </Group>
  );
}

function DownloadsPage() {
  const s = useSettings();
  const [draft, setDraft] = useState(s.dlMirrors);
  const [testing, setTesting] = useState(false);
  const runTest = async () => {
    s.set({ dlMirrors: draft });
    setTesting(true);
    try {
      const r = await testMirrors();
      toast(r.ok.length ? `${r.ok.length} dari ${r.total} mirror aktif` : `Tidak ada mirror aktif dari ${r.total}`);
    } finally {
      setTesting(false);
    }
  };
  return (
    <>
      <Group title="Unduhan offline">
        <Row title="Cari link lain bila gagal" desc="Coba mirror cadangan & versi lain dari lagu yang sama">
          <Switch on={s.dlAltVersions} onChange={(dlAltVersions) => s.set({ dlAltVersions })} label="Cari link lain" />
        </Row>
      </Group>
      <Group title="Mirror tambahan" note={<>Opsional, satu per baris: <code>piped:https://…</code>, <code>invidious:https://…</code> atau <code>cobalt:https://…</code>. Mirror publik sudah dicoba otomatis.</>}>
        <div className="p-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => s.set({ dlMirrors: draft })}
            rows={3}
            spellCheck={false}
            placeholder="piped:https://…"
            className="w-full bg-black/30 rounded-xl px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-white/30"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => void runTest()} disabled={testing} className={pill}>{testing ? 'Menguji…' : 'Uji'}</button>
            <button onClick={() => { s.set({ dlMirrors: draft }); toast('Mirror disimpan'); }} className="px-4 py-1.5 rounded-full bg-white text-black text-sm font-bold">Simpan</button>
          </div>
        </div>
      </Group>
    </>
  );
}

function NotificationsPage() {
  const s = useSettings();
  const checking = useReleases((r) => r.checking);
  const following = useFollows((f) => f.artists.length);
  return (
    <Group title="Notifikasi" note={`Lonceng di atas menandai album & single baru dari ${following} artis yang kamu ikuti.`}>
      <Row title="Rilisan baru" desc="Diperiksa saat aplikasi dibuka & tiap beberapa jam">
        <Switch on={s.releaseAlerts} onChange={(releaseAlerts) => s.set({ releaseAlerts })} label="Notifikasi rilisan baru" />
      </Row>
      <Row title="Periksa sekarang">
        <button onClick={() => void useReleases.getState().check(true).then((n) => { if (!n) toast('Belum ada rilisan baru'); })} disabled={checking || !s.releaseAlerts || !following} className={pill}>
          {checking ? 'Memeriksa…' : 'Periksa'}
        </button>
      </Row>
    </Group>
  );
}

function StoragePage() {
  const [used, setUsed] = useState<number | null>(null);
  // Selector harus mengembalikan nilai primitif: Object.values() membuat array baru tiap render
  // sehingga zustand v5 memicu loop render tanpa henti (layar hitam).
  const dlCount = useDownloads((s) => Object.keys(s.items).length);
  const dlSize = useDownloads((s) => {
    let n = 0;
    for (const k in s.items) n += Number(s.items[k]?.size) || 0;
    return n;
  });
  useEffect(() => {
    let alive = true;
    storageUsed().then((v) => { if (alive) setUsed(v); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const clearCache = async () => {
    try {
      await clearOfflineCache();
      setUsed(await storageUsed());
      toast('Cache offline dihapus');
    } catch {
      toast('Gagal menghapus cache offline');
    }
  };
  return (
    <Group title="Penyimpanan">
      <Row title="Lagu diunduh" desc={`${dlCount} lagu • ${dlCount ? fmtBytes(dlSize) : '0 MB'}`} />
      <Row title="Cache offline" desc={`Beranda, lirik & sampul • ${used != null ? `${(used / 1048576).toFixed(1)} MB` : '—'}`}>
        <button onClick={clearCache} className={pill}>Hapus</button>
      </Row>
    </Group>
  );
}

function DataPage() {
  const { clearHistory, history, liked, playlists } = usePlayer();
  const s = useSettings();
  const loggedIn = useAuth((a) => !!a.token);
  return (
    <>
      <Group title="Riwayat">
        <Row title="Riwayat pemutaran" desc={`${history.length} lagu`}>
          <button onClick={() => { clearHistory(); toast('Riwayat dihapus'); }} className={pill}>Hapus</button>
        </Row>
        <Row title="Pencarian terbaru" desc={`${s.recentSearches.length} kata kunci`}>
          <button onClick={() => { s.clearRecent(); toast('Pencarian terbaru dihapus'); }} className={pill}>Hapus</button>
        </Row>
      </Group>
      <Group title="Zona bahaya">
        <Row title="Reset data lokal" desc={`${liked.length} lagu disukai • ${playlists.length} playlist${loggedIn ? ' — data di akun tetap aman' : ''}`}>
          <button
            onClick={() => {
              if (!confirm('Hapus semua lagu disukai, playlist, riwayat, dan pengaturan di perangkat ini?')) return;
              for (const k of ['sb-player', 'sb-settings', 'sb-taste', 'sb-follows', 'sb-stats', 'sb-releases']) localStorage.removeItem(k);
              location.reload();
            }}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-brand/15 text-brand text-sm font-semibold hover:bg-brand/25"
          >
            <Trash2 className="w-4 h-4" /> Reset
          </button>
        </Row>
      </Group>
    </>
  );
}

function InstallPage() {
  const { installEvt, installed } = usePwa();
  return (
    <Group title="Aplikasi">
      <Row
        title="Instal Stream Beats"
        desc={installed ? 'Sudah terpasang' : installEvt ? 'Pasang di layar utama, buka tanpa bilah browser' : isIOS() ? 'Safari: Bagikan → Tambahkan ke Layar Utama' : 'Chrome/Edge: menu → Instal aplikasi'}
      >
        <button onClick={() => promptInstall()} disabled={!installEvt || installed} className={pill}>{installed ? 'Terpasang' : 'Instal'}</button>
      </Row>
    </Group>
  );
}

function ShortcutsPage() {
  return (
    <Group title="Pintasan keyboard">
      {SHORTCUTS.map(([k, d]) => (
        <Row key={k} title={d}><kbd className="px-2 py-0.5 rounded-md bg-white/10 text-xs font-mono">{k}</kbd></Row>
      ))}
    </Group>
  );
}

/** Huruf serif seperti referensi; di Android memakai Noto Serif bawaan */

const SOCIAL_ICONS: Record<SocialIcon, LucideIcon> = {
  telegram: Send, tiktok: Music2, instagram: Instagram, youtube: Youtube, github: Github,
  facebook: Facebook, twitter: Twitter, link: Globe,
};

function AboutPage() {
  const [bannerOk, setBannerOk] = useState(!!DEVELOPER.banner);
  const [avatarOk, setAvatarOk] = useState(!!DEVELOPER.avatar);
  const initial = DEVELOPER.name.replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || 'F';
  return (
    <div className="mt-3 space-y-6 animate-rise-in">
      {/* Kartu aplikasi */}
      <div className="flex items-center gap-[clamp(14px,4.5vw,22px)] px-[clamp(16px,5vw,24px)] py-5 rounded-2xl bg-white/[.025] border border-white/[.1]">
        <img src="/icon.svg" alt="" className="w-[52px] h-[52px] shrink-0" />
        <div className="min-w-0">
          {/* ukuran sedang seperti referensi: ±22–24px, satu baris, terpotong rapi bila layar sangat sempit */}
          <p className="text-[clamp(20px,6vw,24px)] leading-tight font-bold truncate" style={{ fontFamily: SERIF }}>{APP_NAME}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <span className="px-2.5 py-1 rounded-md text-[13px] font-semibold tracking-wide" style={{ color: ABOUT_ACCENT, background: `${ABOUT_ACCENT}24` }}>{APP_VERSION}</span>
            <span className="px-2.5 py-1 rounded-md bg-white/[.07] text-zinc-100 text-[13px] font-bold tracking-[.1em]">{APP_BADGE}</span>
          </div>
        </div>
      </div>

      {/* Kartu pengembang */}
      <div className="relative aspect-[666/458] rounded-2xl overflow-hidden bg-[#0d0d0d]">
        {bannerOk ? (
          <img src={DEVELOPER.banner} alt="" onError={() => setBannerOk(false)} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_60%_55%_at_50%_0%,rgba(255,255,255,.2),transparent_70%)]" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 pl-[clamp(16px,5vw,24px)] pr-[clamp(16px,5vw,28px)] pb-2 flex items-end justify-between gap-3">
          <div className="min-w-0 pb-1">
            <p className="text-[clamp(24px,8vw,40px)] leading-none font-bold break-words" style={{ fontFamily: SERIF }}>{DEVELOPER.name}</p>
            <p className="mt-3 text-[13px] font-medium tracking-[.14em] uppercase" style={{ color: ABOUT_ACCENT }}>{DEVELOPER.role}</p>
          </div>
          <div className="w-[clamp(80px,26vw,118px)] h-[clamp(80px,26vw,118px)] mb-1 shrink-0 rounded-full overflow-hidden bg-zinc-800 flex items-center justify-center shadow-[0_8px_30px_rgba(0,0,0,.6)]">
            {avatarOk ? (
              <img src={DEVELOPER.avatar} alt={DEVELOPER.name} onError={() => setAvatarOk(false)} className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl font-bold text-white/90" style={{ fontFamily: SERIF }}>{initial}</span>
            )}
          </div>
        </div>
      </div>

      {/* Media sosial */}
      <section>
        <h2 className="mb-3 text-center text-[13px] font-semibold tracking-[.14em] text-zinc-400">MEDIA SOSIAL</h2>
        {SOCIALS.length ? (
          <div className="space-y-3">
            {SOCIALS.map((so) => {
              const Icon = SOCIAL_ICONS[so.icon] || Globe;
              return (
                <a
                  key={so.url}
                  href={so.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl border border-white/[.1] text-zinc-300 hover:bg-white/[.04] active:bg-white/[.07] transition"
                >
                  <Icon className="w-5 h-5" strokeWidth={1.8} />
                  <span className="font-medium">{so.label}</span>
                  <span className="text-zinc-500">·</span>
                  <span className="truncate">{so.handle}</span>
                </a>
              );
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}

const PAGES: Record<string, { title: string; el: () => JSX.Element }> = {
  akun: { title: 'Akun & sinkronisasi', el: AccountPage },
  tampilan: { title: 'Tampilan', el: AppearancePage },
  pemutaran: { title: 'Pemutar & audio', el: PlaybackPage },
  suara: { title: 'Equalizer & suara', el: SoundPage },
  konten: { title: 'Konten', el: ContentPage },
  selera: { title: 'Selera musik', el: TastePage },
  unduhan: { title: 'Unduhan', el: DownloadsPage },
  notifikasi: { title: 'Notifikasi', el: NotificationsPage },
  penyimpanan: { title: 'Penyimpanan', el: StoragePage },
  data: { title: 'Riwayat & data', el: DataPage },
  instal: { title: 'Instal aplikasi', el: InstallPage },
  pintasan: { title: 'Pintasan keyboard', el: ShortcutsPage },
  tentang: { title: 'Tentang', el: AboutPage },
};

/* ------------------------------- halaman utama ------------------------------- */

export default function Settings() {
  const navigate = useNavigate();
  const { section } = useParams();
  const s = useSettings();
  const user = useAuth((a) => a.user);
  const loggedIn = useAuth((a) => !!a.token);
  const dlCount = useDownloads((d) => Object.keys(d.items).length);
  const installed = usePwa((p) => p.installed);
  const togetherOn = useTogether((t) => t.status === 'connected' || t.status === 'pending');
  const page = section ? PAGES[section] : undefined;
  const go = (k: string) => navigate(`/settings/${k}`);

  useEffect(() => { document.getElementById('main-scroll')?.scrollTo(0, 0); }, [section]);

  if (page) {
    const Page = page.el;
    return (
      <div className="px-4 lg:px-6 pb-8 max-w-2xl">
        <Header title={page.title} serif={section === 'tentang'} onBack={() => navigate('/settings')} />
        <Page />
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-6 pb-8 max-w-2xl">
      <Header title="Pengaturan" onBack={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} />

      <button onClick={() => go('akun')} className="mt-3 w-full flex items-center gap-4 p-4 rounded-2xl bg-white/[.045] border border-white/[.06] hover:bg-white/[.07] text-left transition">
        <Avatar size={52} />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-lg truncate">{loggedIn ? user.name : 'Mode tamu'}</p>
          <p className="text-sm text-zinc-400 truncate">{loggedIn ? 'Akun & sinkronisasi' : 'Masuk untuk sinkron ke semua perangkat'}</p>
        </div>
        <ChevronRight className="w-5 h-5 text-zinc-500" />
      </button>

      <Group title="Antarmuka">
        <NavRow icon={Palette} title="Tampilan" value={s.glass ? 'Liquid glass' : 'Standar'} onClick={() => go('tampilan')} />
      </Group>

      <Group title="Pemutar & Konten">
        <NavRow icon={Play} title="Pemutar dan audio" value={s.dataSaver !== 'off' ? 'Hemat data' : undefined} onClick={() => go('pemutaran')} />
        <NavRow icon={SlidersHorizontal} title="Equalizer & suara" value={s.eqOn ? EQ_PRESETS.find((p) => p.id === s.eqPreset)?.name || 'Kustom' : 'Mati'} onClick={() => go('suara')} />
        <NavRow icon={Languages} title="Konten" value={`${label(LANGS, s.hl)} · ${s.gl}`} onClick={() => go('konten')} />
        <NavRow icon={Sparkles} title="Selera musik" onClick={() => go('selera')} />
        <NavRow icon={Users} title="Dengar bersama" value={togetherOn ? 'Terhubung' : undefined} onClick={() => navigate('/together')} />
      </Group>

      <Group title="Unduhan & Notifikasi">
        <NavRow icon={Download} title="Unduhan" value={dlCount ? `${dlCount} lagu` : undefined} onClick={() => go('unduhan')} />
        <NavRow icon={Bell} title="Notifikasi" value={s.releaseAlerts ? 'Aktif' : 'Mati'} onClick={() => go('notifikasi')} />
      </Group>

      <Group title="Penyimpanan & Data">
        <NavRow icon={HardDrive} title="Penyimpanan" onClick={() => go('penyimpanan')} />
        <NavRow icon={History} title="Riwayat & data" onClick={() => go('data')} />
      </Group>

      <Group title="Sistem & Tentang">
        {!isNativeApp() && <NavRow icon={Smartphone} title="Instal aplikasi" value={installed ? 'Terpasang' : undefined} onClick={() => go('instal')} />}
        <div className="hidden lg:block"><NavRow icon={Keyboard} title="Pintasan keyboard" onClick={() => go('pintasan')} /></div>
        <NavRow icon={Info} title="Tentang" value={`v${APP_VERSION}`} onClick={() => go('tentang')} />
      </Group>

      <p className="mt-6 text-center text-xs text-zinc-600 flex items-center justify-center gap-1.5"><UserRound className="w-3.5 h-3.5" /> {loggedIn ? `Masuk sebagai ${user.name}` : 'Data tersimpan di perangkat ini'}</p>
    </div>
  );
}
