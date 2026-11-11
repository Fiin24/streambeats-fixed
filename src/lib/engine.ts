/**
 * Mesin pemutar: YouTube IFrame Player API (tanpa API key).
 * Lagu yang sudah DIUNDUH diputar dari file lokal (IndexedDB) lewat elemen <audio> — bisa offline.
 * Dua player tersembunyi di #yt-host agar bisa crossfade (lagu lama memudar sambil lagu baru masuk).
 * Hanya player "aktif" yang menyinkronkan status ke store pemutar.
 */
import type { Track } from './types';
import { search } from './api';
import { artistNames } from './format';
import { img } from './img';
import { usePlayer } from '../store/player';
import { attachFx, registerFxTarget, fxWanted, onFxChange } from './audioFx';
import { savingData } from './dataSaver';
import { useSettings } from '../store/settings';
import { getOfflineBlob, isDownloaded, useDownloads, fetchStreamBlob } from '../store/downloads';
import { toast } from './toast';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const slots: any[] = []; // dua instance YT.Player
let A = 0; // indeks player aktif

/* ---------- pemutar lokal: lagu yang sudah diunduh (offline) ---------- */
let localMode = false;
let localUrl: string | null = null;
/** naik setiap kali lagu dimuat — mencegah balapan saat membaca file dari IndexedDB */
let loadSeq = 0;
const audio: HTMLAudioElement | null = typeof Audio !== 'undefined' ? new Audio() : null;
if (audio) {
  registerFxTarget(audio);
  audio.preload = 'auto';
  audio.setAttribute('playsinline', '');
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** Adaptor dengan nama metode yang sama seperti YT.Player agar logika lain tetap sama */
const local = {
  playVideo: () => {
    audio?.play().catch((e) => {
      console.warn('[player] audio lokal gagal diputar', e);
      S()?.getState()._sync({ playing: false, buffering: false });
    });
  },
  pauseVideo: () => audio?.pause(),
  stopVideo: () => audio?.pause(),
  seekTo: (sec: number) => { if (audio) audio.currentTime = sec; },
  setVolume: (v: number) => { if (audio) audio.volume = clamp01(v / 100); },
  mute: () => { if (audio) audio.muted = true; },
  unMute: () => { if (audio) audio.muted = false; },
  getCurrentTime: () => audio?.currentTime || 0,
  getDuration: () => (audio && isFinite(audio.duration) ? audio.duration : 0),
  setPlaybackRate: (r: number) => { if (audio) { audio.playbackRate = r; audio.defaultPlaybackRate = r; } },
  getPlaybackRate: () => audio?.playbackRate || 1,
  getPlayerState: () => (!audio ? -1 : audio.ended ? 0 : audio.paused ? 2 : 1),
};
const P = () => (localMode ? local : slots[A]) as any;
/** YT.Player baru punya metode setelah onReady — sebelum itu memanggil playVideo() melempar TypeError */
const isReady = () => localMode || typeof slots[A]?.playVideo === 'function';
/** Panggil metode pemutar dengan aman (tidak melempar bila pemutar belum siap) */
function call(method: string, ...args: any[]): any {
  const p = P();
  if (!p || typeof p[method] !== 'function') return undefined;
  try {
    return p[method](...args);
  } catch (e) {
    console.warn(`[player] ${method} gagal`, e);
    return undefined;
  }
}
/** Pengawas: bila autoplay diblokir browser, pemutar diam di status "belum mulai" → tampilkan tombol putar lagi */
let stallTimer: number | undefined;
function watchStall(seq: number) {
  clearTimeout(stallTimer);
  stallTimer = window.setTimeout(() => {
    if (seq !== loadSeq || localMode) return;
    const st = S()?.getState();
    const state = call('getPlayerState');
    if (st && !st.playing && st.buffering && (state === -1 || state === 5 || state === undefined)) {
      st._sync({ buffering: false, playing: false });
    }
  }, 7000);
}

let ready: Promise<void> | null = null;
let poll: number | undefined;
let current: Track | null = null;
let tried: string[] = [];
let pendingSeek: number | null = null;
/** true bila jeda berasal dari pengguna (tombol, lock screen, timer tidur) — bukan dari sistem */
let userPaused = true;
/** catatan percobaan melanjutkan otomatis saat di latar belakang (anti-loop) */
let resumeLog: number[] = [];
const bgAllowed = () => useSettings.getState().bgPlay !== false;

/**
 * Putar di latar belakang: browser HP / YouTube kadang menjeda pemutar saat aplikasi diminimalkan
 * atau layar dikunci. Jika jeda itu bukan dari pengguna, lanjutkan lagi otomatis.
 */
function shouldAutoResume(): boolean {
  if (userPaused || !bgAllowed() || !navigator.onLine || !current) return false;
  const now = Date.now();
  resumeLog = resumeLog.filter((t) => now - t < 30_000);
  if (resumeLog.length >= 6) return false;
  resumeLog.push(now);
  return true;
}

/** Status crossfade yang sedang berjalan */
let fade: { from: number; to: number; dur: number; started: number | null; timer?: number; watchdog?: number } | null = null;
/** Diset tepat sebelum store memanggil load() untuk transisi otomatis yang di-crossfade */
let xfadeNextLoad = false;
/** Lagu yang sudah memicu crossfade (agar tidak terpicu dua kali) */
let xfadeFiredFor: string | null = null;

// Impor melingkar aman: usePlayer hanya diakses di dalam fungsi saat runtime
const S = () => usePlayer;

/** iOS/iPadOS membatasi audio iframe kedua tanpa sentuhan pengguna → crossfade dimatikan */
export const crossfadeSupported = () =>
  !(/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
// hemat data: tanpa crossfade agar lagu berikutnya tidak dimuat lebih awal oleh player kedua
const crossfadeSecs = () => (crossfadeSupported() && !savingData() ? useSettings.getState().crossfade || 0 : 0);
const userVol = () => {
  const s = S()?.getState();
  return s ? (s.muted ? 0 : s.volume) : 0.8;
};

function loadApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  return new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const inject = () => {
      if (document.getElementById('yt-iframe-api')) return;
      const s = document.createElement('script');
      s.id = 'yt-iframe-api';
      s.src = 'https://www.youtube.com/iframe_api';
      // dibuka saat offline: coba lagi begitu koneksi kembali (lagu unduhan tetap bisa diputar)
      s.onerror = () => {
        s.remove();
        window.addEventListener('online', inject, { once: true });
      };
      document.head.appendChild(s);
    };
    inject();
  });
}

function startPoll() {
  stopPoll();
  poll = window.setInterval(() => {
    const p = P();
    if (!p?.getCurrentTime) return;
    const time = p.getCurrentTime() || 0;
    const duration = p.getDuration() || 0;
    const st = S()?.getState();
    st?._sync({ time, duration: duration || st.duration });
    updatePosition(time, duration);
    maybeCrossfade(time, duration);
  }, 250);
}
function stopPoll() {
  if (poll) clearInterval(poll);
  poll = undefined;
}

/** Mulai crossfade beberapa detik sebelum lagu selesai bila ada lagu berikutnya */
function maybeCrossfade(time: number, duration: number) {
  const cf = crossfadeSecs();
  const st = S()?.getState();
  if (localMode || !cf || fade || !st?.playing || !current || slots.length < 2) return;
  if (duration < cf * 2 + 10 || duration - time > cf || xfadeFiredFor === current.videoId) return;
  if (st.repeat === 'one' || st.sleepEnd || st.sleepSongs === 1) return;
  const hasNext = st.index < st.queue.length - 1 || (st.repeat === 'all' && st.queue.length > 1);
  if (!hasNext) return;
  // lagu berikutnya diputar dari file unduhan → biarkan lagu sekarang selesai utuh
  const nxt = st.index < st.queue.length - 1 ? st.queue[st.index + 1] : st.queue[0];
  if (isDownloaded(nxt?.videoId)) return;
  xfadeFiredFor = current.videoId;
  xfadeNextLoad = true;
  st.next(true);
}

function startCrossfade(t: Track) {
  const from = A, to = 1 - A;
  const np = slots[to];
  const cf = crossfadeSecs();
  A = to; // mulai sekarang event player baru yang menggerakkan store
  np.setVolume(0);
  if (S()?.getState().muted) np.mute();
  else np.unMute();
  np.loadVideoById(t.videoId);
  fade = { from, to, dur: cf * 1000, started: null };
  // Jika player baru tidak mau mulai (diblokir browser), kembali ke cara biasa
  fade.watchdog = window.setTimeout(() => {
    if (!fade || fade.started !== null) return;
    const f = fade;
    fade = null;
    try { slots[f.to].stopVideo(); } catch { /* abaikan */ }
    A = f.from;
    P().setVolume(Math.round(userVol() * 100));
    P().loadVideoById(t.videoId);
  }, 6000);
}

function beginFadeRamp() {
  if (!fade || fade.started !== null) return;
  const f = fade;
  f.started = Date.now();
  clearTimeout(f.watchdog);
  f.timer = window.setInterval(() => {
    const k = Math.min(1, (Date.now() - f.started!) / f.dur);
    const v = userVol() * 100;
    // equal-power: total kenyaringan terasa stabil selama transisi
    slots[f.to]?.setVolume(Math.round(v * Math.sin((k * Math.PI) / 2)));
    slots[f.from]?.setVolume(Math.round(v * Math.cos((k * Math.PI) / 2)));
    if (k >= 1) finishFade();
  }, 80);
}

function finishFade() {
  if (!fade) return;
  const f = fade;
  fade = null;
  clearInterval(f.timer);
  clearTimeout(f.watchdog);
  try { slots[f.from].stopVideo(); } catch { /* abaikan */ }
  slots[f.from]?.setVolume(Math.round(userVol() * 100));
  slots[f.to]?.setVolume(Math.round(userVol() * 100));
}

function updatePosition(time: number, duration: number) {
  try {
    if ('mediaSession' in navigator && duration > 0 && time <= duration)
      navigator.mediaSession.setPositionState({ duration, position: time, playbackRate: S()?.getState().rate || 1 });
  } catch {
    /* abaikan */
  }
}

function setMediaSession(t: Track) {
  if (!('mediaSession' in navigator)) return;
  const art = img(t.thumbnail, 512);
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title,
    artist: artistNames(t),
    album: t.album?.name || 'Stream Beats',
    artwork: art ? [{ src: art, sizes: '512x512', type: 'image/jpeg' }] : [],
  });
  const st = () => S()?.getState();
  navigator.mediaSession.setActionHandler('play', () => engine.play());
  navigator.mediaSession.setActionHandler('pause', () => engine.pause());
  navigator.mediaSession.setActionHandler('nexttrack', () => st()?.next());
  navigator.mediaSession.setActionHandler('previoustrack', () => st()?.prev());
  try {
    navigator.mediaSession.setActionHandler('seekbackward', (d) => { const s = st(); s?.seek(Math.max(0, s.time - (d.seekOffset || 10))); });
    navigator.mediaSession.setActionHandler('seekforward', (d) => { const s = st(); s?.seek(Math.min(s.duration, s.time + (d.seekOffset || 10))); });
  } catch {
    /* tidak didukung */
  }
  try {
    navigator.mediaSession.setActionHandler('seekto', (d) => d.seekTime != null && st()?.seek(d.seekTime));
  } catch {
    /* tidak didukung */
  }
}

/** Jika video tidak boleh di-embed (error 101/150), cari versi lain lagu yang sama */
async function fallback(): Promise<boolean> {
  if (!current) return false;
  const q = `${current.title} ${current.artists?.[0]?.name || ''}`.trim();
  try {
    const [songs, videos] = await Promise.all([search(q, 'songs').catch(() => null), search(q, 'videos').catch(() => null)]);
    const cands = [...(songs?.sections || []), ...(videos?.sections || [])]
      .flatMap((s) => s.items)
      .filter((i) => !!i.videoId && !tried.includes(i.videoId));
    const want = current.duration || 0;
    const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
    const title = norm(current.title);
    // tolak potongan pendek (preview/shorts/teaser) & versi yang durasinya jauh berbeda
    const okLen = (d?: number) => !d || (d >= 60 && (!want || Math.abs(d - want) <= Math.max(20, want * 0.15)));
    const bad = /\b(preview|teaser|snippet|shorts?|cover|karaoke|instrumental|8d|slowed|sped ?up|reverb|nightcore)\b/i;
    const scored = cands
      .filter((i) => okLen(i.duration) && !(bad.test(i.title) && !bad.test(current!.title)))
      .map((i) => {
        let sc = 0;
        if (norm(i.title).includes(title) || title.includes(norm(i.title))) sc += 3;
        if (want && i.duration) sc += 2 - Math.min(2, Math.abs(i.duration - want) / 10);
        if (i.type === 'song') sc += 1;
        return { id: i.videoId as string, sc };
      })
      .sort((a, b) => b.sc - a.sc);
    const id = scored[0]?.id;
    if (!id) return false;
    tried.push(id);
    call('loadVideoById', id);
    return true;
  } catch {
    return false;
  }
}

function onStateChange(e: any) {
  const st = S()?.getState();
  if (!st) return;
  const p = P();
  switch (e.data) {
    case 1: // PLAYING
      failStreak = 0;
      clearTimeout(stallTimer);
      beginFadeRamp();
      st._sync({ playing: true, buffering: false, error: null, duration: p.getDuration() || st.duration });
      if (st.rate !== 1 && p.getPlaybackRate?.() !== st.rate) p.setPlaybackRate(st.rate);
      if (pendingSeek != null) {
        p.seekTo(pendingSeek, true);
        pendingSeek = null;
      }
      startPoll();
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
      break;
    case 2: // PAUSED
      if (document.visibilityState === 'hidden' && shouldAutoResume()) {
        // dijeda sistem saat di latar belakang → lanjutkan tanpa mengubah status UI
        window.setTimeout(() => { if (!userPaused) P()?.playVideo(); }, 300);
        break;
      }
      st._sync({ playing: false, buffering: false });
      stopPoll();
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
      break;
    case 3: // BUFFERING
      st._sync({ buffering: true });
      if (!localMode && !navigator.onLine && current) {
        const t = current, seq = loadSeq;
        window.setTimeout(() => {
          if (seq === loadSeq && !localMode && !navigator.onLine && current === t && S()?.getState().buffering) offlineMiss(t);
        }, 5000);
      }
      break;
    case 0: { // ENDED
      const cur = p?.getCurrentTime?.() || st.time || 0;
      const dur = p?.getDuration?.() || st.duration || current?.duration || 0;
      if (!localMode && current && navigator.onLine && dur > 30 && cur > 0 && cur < dur - 4 && earlyEndFor !== current.videoId) {
        // berhenti sebelum waktunya (jaringan putus sesaat) → lanjutkan, jangan lompat lagu
        earlyEndFor = current.videoId;
        console.warn('[player] lagu berhenti sebelum selesai, melanjutkan', cur, dur);
        call('loadVideoById', { videoId: tried[tried.length - 1] || current.videoId, startSeconds: Math.floor(cur) });
        break;
      }
      if (localMode && current?.duration && dur && dur < current.duration - 15)
        toast('File unduhan lagu ini tidak lengkap — hapus lalu unduh ulang saat online');
      stopPoll();
      st._sync({ playing: false });
      st.next(true);
      break;
    }
  }
}

let failStreak = 0;
/** lagu yang sudah dicoba ulang setelah error / berhenti terlalu cepat (sekali per lagu) */
let retryFor: string | null = null;
let earlyEndFor: string | null = null;
async function onError(e: any) {
  const st = S()?.getState();
  console.warn('[player] YouTube error', e?.data, current?.videoId);
  finishFade();
  if (!navigator.onLine) {
    // offline: lompat ke lagu terunduh berikutnya (atau berhenti dengan pesan) — seperti Spotify
    if (current) offlineMiss(current);
    else st?._sync({ error: 'Kamu sedang offline — putar lagu dari menu Unduhan.', buffering: false, playing: false });
    return;
  }
  if (e.data === 5 && current && retryFor !== current.videoId) {
    // error pemutar HTML5 sering sementara → muat ulang sekali di posisi yang sama
    retryFor = current.videoId;
    const at = Math.floor(st?.time || 0);
    call('loadVideoById', at > 1 ? { videoId: tried[tried.length - 1] || current.videoId, startSeconds: at } : tried[tried.length - 1] || current.videoId);
    return;
  }
  if ([2, 5, 100, 101, 150].includes(e.data) && tried.length < 4 && (await fallback())) return;
  failStreak++;
  if (failStreak >= 4) {
    // kemungkinan masalah jaringan/browser, bukan lagunya — jangan melompat terus-menerus
    failStreak = 0;
    st?._sync({ error: 'Pemutar YouTube tidak dapat memutar audio di browser/jaringan ini.', buffering: false, playing: false });
    return;
  }
  st?._sync({ error: 'Lagu ini tidak bisa diputar, melompat ke berikutnya…', buffering: false });
  setTimeout(() => S()?.getState().next(false), 1200);
}

function makePlayer(el: HTMLElement, i: number): Promise<void> {
  return new Promise<void>((resolve) => {
    slots[i] = new window.YT.Player(el, {
      width: '320',
      height: '180',
      playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, playsinline: 1, rel: 0, origin: location.origin },
      events: {
        onReady: () => {
          const st = S()?.getState();
          if (st) {
            slots[i].setVolume(Math.round(st.volume * 100));
            if (st.muted) slots[i].mute();
          }
          resolve();
        },
        // hanya player aktif yang boleh mengubah status pemutar
        onStateChange: (e: any) => i === A && !localMode && onStateChange(e),
        onError: (e: any) => i === A && !localMode && onError(e),
      },
    });
  });
}

/* ------------------------- pemutaran file unduhan ------------------------- */
function stopYouTube() {
  finishFade();
  for (const p of slots) {
    try { p?.pauseVideo?.(); } catch { /* abaikan */ }
  }
}

function enterLocal(blob: Blob, autoplay: boolean, at = 0) {
  if (!audio) return;
  stopYouTube();
  stopPoll();
  const old = localUrl;
  localUrl = URL.createObjectURL(blob);
  localMode = true;
  const st = S()?.getState();
  audio.src = localUrl;
  audio.volume = clamp01(st ? st.volume : 0.8);
  audio.muted = !!st?.muted;
  audio.defaultPlaybackRate = st?.rate || 1;
  audio.playbackRate = st?.rate || 1;
  attachFx(audio);
  if (old) URL.revokeObjectURL(old);
  if (at > 0) {
    audio.addEventListener('loadedmetadata', () => { audio.currentTime = at; }, { once: true });
    st?._sync({ time: at });
  }
  if (autoplay) local.playVideo();
  else st?._sync({ playing: false, buffering: false });
}

function exitLocal() {
  if (!audio || !localMode) return;
  localMode = false; // set dulu agar event "pause" berikut diabaikan
  audio.pause();
  audio.removeAttribute('src');
  try { audio.load(); } catch { /* abaikan */ }
  if (localUrl) URL.revokeObjectURL(localUrl);
  localUrl = null;
}

/** Offline & lagu belum diunduh: lompat ke lagu terunduh berikutnya di antrean, atau beri tahu */
function offlineMiss(t: Track) {
  const st = S()?.getState();
  if (!st) return;
  stopYouTube();
  const items = useDownloads.getState().items;
  const nextIdx = st.queue.findIndex((q, i) => i > st.index && !!items[q.videoId]);
  if (nextIdx >= 0 && !userPaused) {
    st._sync({ error: 'Offline — melompat ke lagu yang sudah diunduh…', buffering: false, playing: false });
    window.setTimeout(() => {
      const s = S()?.getState();
      if (s?.current?.videoId === t.videoId) s.jumpTo(nextIdx);
    }, 700);
  } else {
    st._sync({ error: 'Kamu sedang offline — lagu ini belum diunduh.', buffering: false, playing: false });
  }
}

function onLocalError() {
  const t = current;
  console.warn('[player] file unduhan tidak bisa diputar', t?.videoId, audio?.error);
  exitLocal();
  if (!t) return;
  if (navigator.onLine) streamYT(t, !userPaused, loadSeq);
  else S()?.getState()._sync({ error: 'File unduhan rusak — unduh ulang saat online.', buffering: false, playing: false });
}

function bindLocal() {
  if (!audio) return;
  const on = (ev: string, fn: () => void) => audio.addEventListener(ev, () => { if (localMode) fn(); });
  on('playing', () => onStateChange({ data: 1 }));
  on('pause', () => { if (!audio.ended) onStateChange({ data: 2 }); });
  on('waiting', () => onStateChange({ data: 3 }));
  on('ended', () => onStateChange({ data: 0 }));
  on('loadedmetadata', () => {
    const d = local.getDuration();
    if (d) S()?.getState()._sync({ duration: d });
  });
  on('error', onLocalError);
}
bindLocal();

/** Cache kecil audio untuk mode Equalizer (hindari unduh ulang saat lagu diulang/diputar balik) */
const fxCache = new Map<string, Blob>();
let fxAbort: AbortController | null = null;
let fxWarned = false;
async function fxBlob(t: Track, seq: number, background = false): Promise<Blob | null> {
  const hit = fxCache.get(t.videoId);
  if (hit) return hit;
  fxAbort?.abort();
  const ac = (fxAbort = new AbortController());
  if (!background) S()?.getState()._sync({ buffering: true, error: null } as any);
  try {
    const blob = await Promise.race([
      fetchStreamBlob(t, ac.signal),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 45_000)),
    ]);
    fxCache.set(t.videoId, blob);
    trimCache();
    return blob;
  } catch (e) {
    if (seq === loadSeq && !fxWarned) {
      fxWarned = true;
      toast('Equalizer belum bisa diterapkan pada lagu ini (audio gagal diambil) — tetap diputar tanpa EQ');
    }
    console.warn('[fx] gagal mengambil audio untuk EQ', e);
    return null;
  } finally {
    if (fxAbort === ac) fxAbort = null;
  }
}
/** Ambil audio di latar lalu pindah dari streaming YouTube ke jalur EQ di posisi yang sama */
function switchToFx(t: Track, seq: number) {
  void fxBlob(t, seq, true).then((blob) => {
    if (!blob || seq !== loadSeq || current !== t || localMode) return;
    let at = 0, playing = !userPaused;
    try { at = slots[A]?.getCurrentTime?.() || 0; playing = slots[A]?.getPlayerState?.() === 1 || (playing && slots[A]?.getPlayerState?.() === 3); } catch { /* abaikan */ }
    xfadeNextLoad = false;
    enterLocal(blob, playing, at);
    prefetchNext();
  });
}
/** Siapkan audio lagu berikutnya di antrean agar langsung terdengar dengan EQ */
function prefetchNext() {
  const st = S()?.getState();
  const next = st?.queue?.[st.index + 1];
  if (!next || !fxWanted() || fxCache.has(next.videoId) || next.videoId.startsWith('local:') || isDownloaded(next.videoId) || savingData()) return;
  const ac = new AbortController();
  void fetchStreamBlob(next, ac.signal).then((b) => { fxCache.set(next.videoId, b); trimCache(); }).catch(() => {});
}
const trimCache = () => { while (fxCache.size > 4) fxCache.delete(fxCache.keys().next().value as string); };
/** EQ dinyalakan saat lagu sedang streaming → pindahkan lagu yang sama ke jalur EQ */
onFxChange(() => {
  const t = current;
  if (!t || localMode || !fxWanted() || !navigator.onLine) return;
  switchToFx(t, loadSeq);
});

/** Putar lewat YouTube (streaming) */
async function streamYT(t: Track, autoplay: boolean, seq: number) {
  if (!isReady()) await ready;
  if (seq !== loadSeq || !isReady()) return;
  const cross = xfadeNextLoad && autoplay && slots[1 - A]?.loadVideoById;
  xfadeNextLoad = false;
  if (cross) return startCrossfade(t);
  finishFade();
  const startSeconds = pendingSeek != null && pendingSeek > 0 ? Math.floor(pendingSeek) : undefined;
  const arg = startSeconds ? { videoId: t.videoId, startSeconds } : t.videoId;
  if (startSeconds) pendingSeek = null;
  if (autoplay) {
    call('loadVideoById', arg);
    // hemat data: minta kualitas terendah (player tersembunyi tidak butuh gambar)
    if (savingData()) call('setPlaybackQuality', 'tiny');
    watchStall(seq);
  } else {
    call('cueVideoById', arg);
    S()?.getState()._sync({ buffering: false, playing: false });
  }
}

export const engine = {
  init(host: HTMLElement): Promise<void> {
    if (ready) return ready;
    // kembali ke aplikasi: bila musik terhenti bukan karena pengguna, lanjutkan
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || userPaused || !bgAllowed()) return;
      if (call('getPlayerState') === 2) call('playVideo');
    });
    ready = loadApi().then(() => {
      const els = [0, 1].map(() => {
        const d = document.createElement('div');
        host.appendChild(d);
        return d;
      });
      // player kedua hanya dibutuhkan untuk crossfade; kegagalannya tidak menghalangi pemutaran
      const second = makePlayer(els[1], 1).catch(() => undefined);
      return makePlayer(els[0], 0).then(() => void second);
    });
    return ready;
  },
  async load(t: Track, autoplay = true, startAt = 0) {
    const seq = ++loadSeq;
    current = t;
    userPaused = !autoplay;
    tried = [t.videoId];
    retryFor = null;
    earlyEndFor = null;
    pendingSeek = startAt > 0 ? startAt : null;
    setMediaSession(t);
    // sudah diunduh → putar dari file lokal (tanpa internet)
    if (isDownloaded(t.videoId)) {
      const blob = await getOfflineBlob(t.videoId);
      if (seq !== loadSeq) return;
      if (blob) {
        xfadeNextLoad = false;
        pendingSeek = null;
        return enterLocal(blob, autoplay, startAt);
      }
    }
    if (localMode) {
      exitLocal();
      xfadeNextLoad = false;
    }
    if (t.videoId.startsWith('local:')) {
      // file impor yang tidak ada di perangkat ini
      S()?.getState()._sync({ error: 'File lokal ini tidak ada di perangkat ini', buffering: false, playing: false });
      return;
    }
    if (!navigator.onLine) return offlineMiss(t);
    // Equalizer/normalisasi aktif: lagu yang sudah di-cache langsung diputar lewat EQ;
    // selain itu mulai streaming dulu (tanpa jeda) lalu pindah mulus ke jalur EQ setelah audio siap.
    if (fxWanted() && !t.videoId.startsWith('local:')) {
      const hit = fxCache.get(t.videoId);
      if (hit) {
        xfadeNextLoad = false;
        const at = pendingSeek || startAt;
        pendingSeek = null;
        enterLocal(hit, autoplay, at);
        prefetchNext();
        return;
      }
      void streamYT(t, autoplay, seq);
      switchToFx(t, seq);
      return;
    }
    return streamYT(t, autoplay, seq);
  },
  /** true bila lagu sekarang diputar dari file unduhan */
  isLocal: () => localMode,
  /** posisi pemutar saat ini langsung dari player (lebih akurat dari state yang di-poll) */
  currentTime: (): number => { try { return Number(P()?.getCurrentTime?.()) || 0; } catch { return 0; } },
  /** Siapkan lagu terakhir dari sesi sebelumnya tanpa autoplay */
  async restore(t: Track, at = 0) {
    const seq = ++loadSeq;
    current = t;
    userPaused = true;
    tried = [t.videoId];
    setMediaSession(t);
    if (isDownloaded(t.videoId)) {
      const blob = await getOfflineBlob(t.videoId);
      if (seq !== loadSeq) return;
      if (blob) return enterLocal(blob, false, at > 5 ? at : 0);
    }
    await ready;
    if (seq !== loadSeq) return;
    pendingSeek = at > 5 ? at : null;
    if (pendingSeek) call('cueVideoById', { videoId: t.videoId, startSeconds: Math.floor(pendingSeek) });
    else call('cueVideoById', t.videoId);
  },
  async play() {
    userPaused = false;
    const st = S()?.getState();
    if (!current && st?.current) current = st.current;
    if (!current) return;
    if (localMode) return local.playVideo();
    if (!navigator.onLine && !isDownloaded(current.videoId)) return offlineMiss(current);
    if (!isReady()) {
      // pemutar YouTube belum siap (aplikasi baru dibuka) → tunggu, lalu lanjutkan
      st?._sync({ buffering: true, error: null });
      await ready;
      if (userPaused) return;
    }
    const vid = call('getVideoData')?.video_id as string | undefined;
    // belum ada lagu di pemutar / lagu lain / sebelumnya error → muat ulang lagu sekarang
    if (st?.error || !vid || (vid !== current.videoId && !tried.includes(vid))) {
      const at = st && st.time > 1 && st.time < (st.duration || Infinity) - 1 ? st.time : 0;
      st?._sync({ error: null });
      return engine.load(current, true, at);
    }
    call('playVideo');
    watchStall(loadSeq);
  },
  pause() {
    userPaused = true;
    clearTimeout(stallTimer);
    finishFade();
    call('pauseVideo');
    // YouTube tidak mengirim event PAUSED bila lagu belum mulai → perbarui UI langsung
    S()?.getState()._sync({ playing: false, buffering: false });
  },
  seek(sec: number) {
    finishFade();
    if (!isReady() || (!localMode && call('getPlayerState') === -1)) {
      pendingSeek = sec;
      return;
    }
    call('seekTo', sec, true);
  },
  setRate(r: number) {
    call('setPlaybackRate', r);
  },
  /** Volume sementara (fade timer tidur) tanpa mengubah pengaturan pengguna */
  setRawVolume(v: number) {
    call('setVolume', Math.round(v * 100));
  },
  setVolume(v: number, muted: boolean) {
    if (audio) {
      audio.volume = clamp01(v);
      audio.muted = muted;
    }
    for (const p of slots) {
      if (!p?.setVolume) continue;
      // saat crossfade, volume diatur oleh ramp
      if (!fade) p.setVolume(Math.round(v * 100));
      if (muted) p.mute();
      else p.unMute();
    }
  },
};
