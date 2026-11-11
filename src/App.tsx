import { lazy, Suspense, useEffect } from 'react';
import { initUserNotifs } from './store/userNotifs';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import BackButton from './components/BackButton';
import DesktopHeader from './components/DesktopHeader';
import LeftSidebar from './components/LeftSidebar';
import RightPanel from './components/RightPanel';
import PlayerBar from './components/PlayerBar';
import MiniPlayer from './components/MiniPlayer';
import MobileNav from './components/MobileNav';
import FullPlayer from './components/FullPlayer';
import LyricsScreen from './components/LyricsScreen';
import { PwaStatus } from './components/PwaBanners';
import YTHost from './components/YTHost';
import Toast from './components/Toast';
import ShareSheet from './components/ShareSheet';
import Home from './pages/Home';
import { resumeTogether } from './lib/together';
import { GlassDefs } from './components/Glass';
import { usePlayer } from './store/player';
import { engine } from './lib/engine';
import { toast } from './lib/toast';
import Onboarding from './pages/Onboarding';
import Auth from './pages/Auth';
import { initShortcuts } from './lib/shortcuts';
import { initRoomPresence } from './lib/social';
import { useAuth, needsAuth } from './store/auth';
import { startSync, syncNow } from './lib/sync';
import { useListenStats } from './lib/listenStats';
import { useTaste } from './store/taste';
import { useBackgroundPlayback } from './lib/background';
import { getNext } from './lib/api';
import type { Track } from './lib/types';
import { useReleaseWatcher } from './store/releases';

// Halaman selain Beranda dimuat saat dibuka agar aplikasi terbuka lebih cepat
const Search = lazy(() => import('./pages/Search'));
const Library = lazy(() => import('./pages/Library'));
const Settings = lazy(() => import('./pages/Settings'));
const Artist = lazy(() => import('./pages/Artist'));
const Collection = lazy(() => import('./pages/Collection'));
const Downloads = lazy(() => import('./pages/Downloads'));
const Together = lazy(() => import('./pages/Together'));
const Profile = lazy(() => import('./pages/Profile'));
const Recap = lazy(() => import('./pages/Recap'));
const Collab = lazy(() => import('./pages/Collab'));
const Charts = lazy(() => import('./pages/Charts'));
const UserProfile = lazy(() => import('./pages/UserProfile'));

function useShortcuts() {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      const p = usePlayer.getState();
      if (e.code === 'Space') { e.preventDefault(); p.toggle(); }
      else if (e.key === 'ArrowRight' && e.shiftKey) p.next();
      else if (e.key === 'ArrowLeft' && e.shiftKey) p.prev();
      else if (e.key === 'ArrowRight') p.seek(Math.min(p.duration, p.time + 5));
      else if (e.key === 'ArrowLeft') p.seek(Math.max(0, p.time - 5));
      else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowUp') { e.preventDefault(); p.setVolume(Math.min(1, +(p.volume + 0.05).toFixed(2))); }
      else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowDown') { e.preventDefault(); p.setVolume(Math.max(0, +(p.volume - 0.05).toFixed(2))); }
      else if (e.ctrlKey || e.metaKey || e.altKey) return;
      else if (e.key.toLowerCase() === 'm') p.toggleMute();
      else if (e.key.toLowerCase() === 'l' && p.current) p.setLyricsOpen(!p.lyricsOpen);
      else if (e.key.toLowerCase() === 'q') p.setRightPanel('queue');
      else if (e.key.toLowerCase() === 's') { p.toggleShuffle(); const n = usePlayer.getState(); toast(n.smart ? 'Acak cerdas: lagu rekomendasi ditambahkan' : n.shuffle ? 'Acak aktif' : 'Acak mati'); }
      else if (e.key.toLowerCase() === 'r') {
        p.cycleRepeat();
        const r = usePlayer.getState().repeat;
        toast(r === 'one' ? 'Ulangi satu lagu' : r === 'all' ? 'Ulangi semua' : 'Ulangi mati');
      }
      else if (e.key.toLowerCase() === 'f' && p.current) p.setFullPlayer(!p.fullPlayer);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
}

/** Timer tidur: volume memudar 10 detik terakhir, lalu pemutaran dijeda */
function useSleepTimer() {
  useEffect(() => {
    let faded = false;
    const id = window.setInterval(() => {
      const s = usePlayer.getState();
      if (!s.sleepAt) {
        if (faded) { engine.setVolume(s.volume, s.muted); faded = false; }
        return;
      }
      const left = s.sleepAt - Date.now();
      if (left <= 0) {
        engine.pause();
        s.setSleep(null);
        faded = false;
        setTimeout(() => { const n = usePlayer.getState(); engine.setVolume(n.volume, n.muted); }, 800);
        toast('Timer tidur: pemutaran dijeda');
      } else if (left < 10_000 && s.playing && !s.muted) {
        engine.setRawVolume(s.volume * (left / 10_000));
        faded = true;
      }
    }, 500);
    return () => clearInterval(id);
  }, []);
}

/** Simpan posisi lagu agar bisa dilanjutkan setelah aplikasi dibuka lagi (seperti Spotify) */
function useResumePosition() {
  useEffect(() => {
    const save = () => {
      const s = usePlayer.getState();
      if (s.current && s.time > 0) localStorage.setItem('sb-resume', JSON.stringify({ v: s.current.videoId, t: Math.floor(s.time) }));
    };
    const id = window.setInterval(save, 5000);
    const vis = () => document.visibilityState === 'hidden' && save();
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(id);
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);
}

/** Buka tautan bersama: /?play=VIDEO_ID&t=DETIK (dari tombol Bagikan / Dengar Bareng) */
function useSharedLink() {
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const id = sp.get('play');
    if (!id || !/^[\w-]{11}$/.test(id)) return;
    const at = Math.max(0, Number(sp.get('t')) || 0);
    sp.delete('play');
    sp.delete('t');
    history.replaceState(history.state, '', location.pathname + (sp.toString() ? `?${sp}` : '') + location.hash);
    // posisi juga dipakai bila pemutar YouTube baru siap setelah ini (lihat YTHost)
    localStorage.setItem('sb-resume', JSON.stringify({ v: id, t: Math.floor(at) }));
    (async () => {
      let t: Track | undefined;
      try {
      const n = await getNext(id);
      t = n.tracks.find((x) => x.videoId === id) as Track | undefined;
    } catch { /* pakai data minimal */ }
    if (!t) t = { type: 'song', id, videoId: id, title: 'Lagu yang dibagikan', artists: [], thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, subtitle: '' } as unknown as Track;
      usePlayer.getState().openShared(t, at);
      toast('Ketuk ▶ untuk mulai mendengarkan');
    })();
  }, []);
}

function PageFallback() {
  return (
    <div className="px-4 lg:px-6 pt-6 space-y-4 animate-fade-in" aria-busy="true" aria-label="Memuat halaman">
      <div className="h-7 w-40 rounded-md bg-white/[.06]" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="aspect-square rounded-md bg-white/[.04]" />)}
      </div>
    </div>
  );
}

/** Gerbang: masuk/daftar (username & password) → pilih genre & artis (sekali) → aplikasi */
export default function App() {
  const ready = useAuth((s) => s.ready);
  const mustAuth = useAuth(needsAuth);
  const uid = useAuth((s) => s.user.uid);
  const guest = useAuth((s) => s.guest);
  const onboarded = useTaste((s) => !!s.byUser[uid]?.done);
  useEffect(() => {
    void useAuth.getState().init();
    startSync();
  }, []);
  if (!ready) return <div className="h-[100dvh] bg-black" />;
  if (mustAuth) return <Auth />;
  // Tamu langsung masuk tanpa onboarding; login/register tersedia dari profil/settings.
  if (!guest && !onboarded) return <Onboarding />;
  return <MainApp />;
}

function MainApp() {
  const { pathname } = useLocation();
  const hasTrack = usePlayer((s) => !!s.current);
  useShortcuts();
  useSleepTimer();
  useResumePosition();
  useBackgroundPlayback();
  useSharedLink();
  useListenStats();
  useReleaseWatcher();
  const token = useAuth((s) => s.token);
  useEffect(() => { if (token) void syncNow(); }, [token]);
  // Dengar bersama: lanjutkan sesi yang masih berjalan setelah aplikasi dibuka ulang
  useEffect(() => { resumeTogether(); }, []);
  const navigate = useNavigate();
  useEffect(() => { initShortcuts(navigate); initRoomPresence(); initUserNotifs(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    document.getElementById('main-scroll')?.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div
      className="h-[100dvh] flex flex-col bg-black text-white overflow-hidden"
      style={{ ['--dock' as any]: hasTrack ? '104px' : '16px' }}
    >
      <GlassDefs />
      <DesktopHeader />
      <BackButton />
      <div className="flex-1 min-h-0 flex lg:gap-2 lg:px-2 lg:pb-2">
        <LeftSidebar />
        <main
          id="main-scroll"
          className={`flex-1 min-w-0 overflow-y-auto overscroll-contain bg-[#0a0a0a] lg:bg-panel lg:rounded-lg
            ${hasTrack ? 'pb-[calc(168px+env(safe-area-inset-bottom))]' : 'pb-[calc(96px+env(safe-area-inset-bottom))]'} lg:pb-[var(--dock)]`}
        >
          <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<Search />} />
            <Route path="/library" element={<Library />} />
            <Route path="/downloads" element={<Downloads />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/:section" element={<Settings />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/recap" element={<Recap />} />
            <Route path="/charts" element={<Charts />} />
            <Route path="/collab" element={<Collab />} />
            <Route path="/collab/:id" element={<Collab />} />
            <Route path="/artist/:id" element={<Artist />} />
            <Route path="/album/:id" element={<Collection />} />
            <Route path="/playlist/:id" element={<Collection />} />
            <Route path="/my/:id" element={<Collection />} />
            <Route path="/liked" element={<Collection />} />
            <Route path="/history" element={<Collection />} />
            <Route path="/mix/:id" element={<Collection />} />
            <Route path="/smart/:id" element={<Collection />} />
            <Route path="/together" element={<Together />} />
            <Route path="/together/:section" element={<Together />} />
            <Route path="/u/:username" element={<UserProfile />} />
            <Route path="/u/:username/p/:id" element={<Collection />} />
            <Route path="*" element={<Home />} />
          </Routes>
          </Suspense>
        </main>
        <RightPanel />
      </div>
      <PlayerBar />
      <MiniPlayer />
      <MobileNav />
      <FullPlayer />
      <LyricsScreen />
      <PwaStatus />
      <YTHost />
      <Toast />
      <ShareSheet />
    </div>
  );
}
