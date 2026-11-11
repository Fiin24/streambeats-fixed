import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track, UserPlaylist } from '../lib/types';
import { engine } from '../lib/engine';
import { getNext } from '../lib/api';
import { useSettings } from './settings';
import { uid } from '../lib/format';
import { toast } from '../lib/toast';
import { markRemoved } from './syncMeta';
import { canPlayNow, findPlayable, isOnline, playableNow } from '../lib/offline';
import { isGuestSync, togetherHooks } from './together';

const GUEST_MSG = 'Kamu sedang mengikuti host Dengar bersama';
/** Tamu Dengar bersama tidak mengganti lagu sendiri — lagu yang dipilih disarankan ke host */
const guestSuggest = (t?: Track) => {
  if (!isGuestSync()) return false;
  if (t && togetherHooks.suggest) togetherHooks.suggest(t);
  else toast(GUEST_MSG);
  return true;
};

const OFFLINE_MSG = 'Kamu sedang offline — lagu ini belum diunduh';

export type Repeat = 'off' | 'all' | 'one';
export type RightPanel = 'nowplaying' | 'queue' | 'lyrics' | null;

interface PlayerState {
  queue: Track[];
  original: Track[] | null;
  index: number;
  current: Track | null;
  playing: boolean;
  buffering: boolean;
  time: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: Repeat;
  rightPanel: RightPanel;
  fullPlayer: boolean;
  fullTab: 'lyrics' | 'queue' | null;
  error: string | null;
  liked: Track[];
  history: Track[];
  playlists: UserPlaylist[];
  /** Kecepatan putar (0.5–2) */
  rate: number;
  /** Timer tidur: waktu (ms epoch) saat pemutaran dijeda */
  sleepAt: number | null;
  /** Timer tidur: jeda setelah lagu saat ini selesai */
  sleepEnd: boolean;
  /** Timer tidur: jeda setelah N lagu lagi (0 = mati) */
  sleepSongs: number;
  /** Acak Cerdas: acak + sisipkan lagu rekomendasi */
  smart: boolean;
  /** Layar lirik penuh ala Spotify */
  lyricsOpen: boolean;
  lyricsFromFull: boolean;

  playTrack: (t: Track, list?: Track[]) => void;
  playList: (list: Track[], start?: number, shuffle?: boolean) => void;
  /** Mulai radio dari lagu ini (selalu mengisi antrean dengan rekomendasi) */
  startRadio: (t: Track) => void;
  /** Buka lagu dari tautan "Dengar Bareng" di posisi tertentu (tanpa autoplay — butuh ketukan pengguna) */
  openShared: (t: Track, at?: number) => void;
  /** Dengar bersama (tamu): putar lagu host di posisi tertentu tanpa radio otomatis */
  syncTo: (t: Track, at: number, play: boolean) => void;
  /** Ganti akun: hentikan lagu & siapkan lagu terakhir akun itu tanpa diputar (null = kosongkan pemutar) */
  restoreIdle: (t: Track | null) => void;
  toggle: () => void;
  next: (auto?: boolean) => void;
  prev: () => void;
  seek: (sec: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  jumpTo: (i: number) => void;
  addToQueue: (t: Track) => void;
  playNext: (t: Track) => void;
  removeFromQueue: (i: number) => void;
  clearQueue: () => void;
  toggleLike: (t: Track) => void;
  setRightPanel: (p: RightPanel) => void;
  setFullPlayer: (open: boolean, tab?: 'lyrics' | 'queue' | null) => void;
  createPlaylist: (name: string, description?: string, tags?: string[]) => string;
  addToPlaylist: (id: string, t: Track) => void;
  removeFromPlaylist: (id: string, videoId: string) => void;
  deletePlaylist: (id: string) => void;
  /** ubah nama & deskripsi playlist pribadi */
  editPlaylist: (id: string, name: string, description?: string) => void;
  /** ubah tag mood playlist (maks. 4) */
  editPlaylistTags: (id: string, tags: string[]) => void;
  clearHistory: () => void;
  moveInQueue: (from: number, to: number) => void;
  setRate: (r: number) => void;
  setSleep: (min: number | 'end' | null) => void;
  setSleepSongs: (n: number) => void;
  setLyricsOpen: (open: boolean) => void;
  keepRecommended: (i: number) => void;
  _sync: (p: Partial<Pick<PlayerState, 'playing' | 'buffering' | 'time' | 'duration' | 'error'>>) => void;
}

const slim = (t: Track): Track => ({
  type: t.type, id: t.videoId, videoId: t.videoId, title: t.title, subtitle: t.subtitle, artists: t.artists,
  thumbnail: t.thumbnail, album: t.album, duration: t.duration, durationText: t.durationText, explicit: t.explicit,
});
const shuffled = <T,>(a: T[]) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

/** Simpan maks. 200 lagu antrean di sekitar lagu sekarang agar index tetap menunjuk lagu yang benar */
const persistedQueue = (queue: Track[], index: number) => {
  const from = Math.max(0, Math.min(index - 50, queue.length - 200));
  return { queue: queue.slice(from, from + 200), index: index - from };
};

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => {
      /** Memuat lagu ke-index dari antrean dan mulai memutar */
      const start = (queue: Track[], index: number, dir: 1 | -1 = 1) => {
        // offline: lewati lagu yang belum diunduh (seperti Spotify)
        if (!canPlayNow(queue[index])) {
          const alt = findPlayable(queue, index, dir);
          if (alt < 0) {
            toast(OFFLINE_MSG);
            return false;
          }
          index = alt;
        }
        const t = queue[index];
        if (!t) return false;
        set((s) => ({
          queue, index, current: t, time: 0, duration: t.duration || 0, error: null, buffering: true,
          history: [{ ...slim(t), playedAt: Date.now() }, ...s.history.filter((h) => h.videoId !== t.videoId)].slice(0, 100),
        }));
        engine.load(t);
        return true;
      };
      /** Isi antrean dengan radio YouTube Music (seperti Metrolist "Mulai radio") */
      const extendWithRadio = async (seed: Track) => {
        if (!isOnline() || seed.videoId.startsWith('local:')) return 0;
        try {
          const n = await getNext(seed.videoId);
          const s = get();
          const have = new Set(s.queue.map((q) => q.videoId));
          const add = n.tracks.filter((t): t is Track => !!t.videoId && !have.has(t.videoId));
          if (add.length) set({ queue: [...s.queue, ...add] });
          return add.length;
        } catch {
          return 0;
        }
      };

      /** Acak Cerdas: ambil rekomendasi dari beberapa lagu di antrean lalu sisipkan 1 tiap 3 lagu */
      const smartify = async () => {
        const s0 = get();
        const base = s0.queue.filter((t) => !t.rec);
        if (!base.length) return;
        const seeds = shuffled(base).slice(0, 3);
        const have = new Set(s0.queue.map((t) => t.videoId));
        const pools = await Promise.all(seeds.map((t) => getNext(t.videoId).then((n) => n.tracks).catch(() => [])));
        const recs: Track[] = [];
        for (let r = 0; recs.length < 40 && pools.some((p) => p.length > r); r++)
          for (const p of pools) {
            const t = p[r];
            if (t?.videoId && !have.has(t.videoId)) {
              have.add(t.videoId);
              recs.push({ ...(t as Track), rec: true });
            }
          }
        const s = get();
        if (!s.smart || !recs.length) return;
        const head = s.queue.slice(0, s.index + 1);
        const rest = s.queue.slice(s.index + 1).filter((t) => !t.rec);
        const mixed: Track[] = [];
        const rq = shuffled(recs);
        rest.forEach((t, i) => {
          mixed.push(t);
          if (i % 3 === 2 && rq.length) mixed.push(rq.shift()!);
        });
        // antrean pendek: tambahkan rekomendasi di akhir agar tetap terasa "cerdas"
        if (rest.length < 12) mixed.push(...rq.slice(0, Math.max(4, 12 - rest.length)));
        set({ queue: [...head, ...mixed] });
      };

      return {
        queue: [], original: null, index: -1, current: null, playing: false, buffering: false, time: 0, duration: 0,
        volume: 0.8, muted: false, shuffle: false, repeat: 'off', rightPanel: 'nowplaying', fullPlayer: false, fullTab: null,
        error: null, liked: [], history: [], playlists: [], rate: 1, sleepAt: null, sleepEnd: false, sleepSongs: 0, smart: false, lyricsOpen: false, lyricsFromFull: false,

        playTrack: (t, list) => {
          if (guestSuggest(t)) return;
          if (!canPlayNow(t)) {
            toast(OFFLINE_MSG);
            return;
          }
          // offline: antrean hanya berisi lagu yang sudah diunduh
          if (list?.length) list = playableNow(list);
          if (list && list.length > 1) {
            const i = Math.max(0, list.findIndex((x) => x.videoId === t.videoId));
            set({ shuffle: false, smart: false, original: null });
            start(list, i);
            return;
          }
          set({ shuffle: false, smart: false, original: null });
          start([t], 0);
          if (useSettings.getState().autoplayRadio) extendWithRadio(t);
        },
        startRadio: (t) => {
          if (guestSuggest(t)) return;
          if (!isOnline()) {
            toast('Radio butuh internet — putar lagu dari Unduhan saat offline');
            return;
          }
          set({ shuffle: false, smart: false, original: null });
          start([t], 0);
          extendWithRadio(t).then((n) => toast(n ? `Radio dimulai • ${n} lagu ditambahkan` : 'Radio tidak tersedia untuk lagu ini'));
        },
        openShared: (t, at = 0) => {
          if (guestSuggest(t)) return;
          set((s) => ({
            shuffle: false, smart: false, original: null, queue: [t], index: 0, current: t, time: at, duration: t.duration || 0,
            error: null, buffering: false, playing: false, fullPlayer: true, fullTab: null,
            history: [{ ...slim(t), playedAt: Date.now() }, ...s.history.filter((h) => h.videoId !== t.videoId)].slice(0, 100),
          }));
          engine.load(t, false, at);
          extendWithRadio(t);
        },
        playList: (list, startAt = 0, shuffle = false) => {
          if (!list.length) return;
          if (guestSuggest(shuffle ? list[Math.floor(Math.random() * list.length)] : list[startAt] || list[0])) return;
          if (list.some((t) => !canPlayNow(t))) {
            const first = list[startAt];
            list = playableNow(list);
            if (!list.length) {
              toast(isOnline() ? 'Tidak ada lagu yang bisa diputar di perangkat ini' : 'Kamu sedang offline — belum ada lagu yang diunduh di sini');
              return;
            }
            startAt = Math.max(0, first ? list.findIndex((x) => x.videoId === first.videoId) : 0);
          }
          if (shuffle) {
            const q = shuffled(list);
            set({ shuffle: true, original: list });
            start(q, 0);
            if (get().smart) smartify();
          } else {
            set({ shuffle: false, smart: false, original: null });
            start(list, startAt);
          }
        },
        restoreIdle: (t) => {
          engine.pause();
          if (!t) {
            set({ queue: [], index: -1, current: null, time: 0, duration: 0, playing: false, buffering: false, error: null, fullPlayer: false });
            return;
          }
          set({
            shuffle: false, smart: false, original: null, queue: [t], index: 0, current: t, time: 0, duration: t.duration || 0,
            playing: false, buffering: false, error: null, fullPlayer: false,
          });
          void engine.restore(t, 0);
        },
        syncTo: (t, at, play) => {
          set((s) => ({
            shuffle: false, smart: false, original: null, queue: [t], index: 0, current: t, time: at, duration: t.duration || 0,
            error: null, buffering: play,
            history: [{ ...slim(t), playedAt: Date.now() }, ...s.history.filter((h) => h.videoId !== t.videoId)].slice(0, 100),
          }));
          engine.load(t, play, at);
        },
        toggle: () => {
          const s = get();
          if (!s.current) return;
          if (isGuestSync() && togetherHooks.toggle) return togetherHooks.toggle();
          if (s.playing) engine.pause();
          else engine.play();
        },
        next: async (auto = false) => {
          const s = get();
          if (!s.current) return;
          // tamu Dengar bersama: tunggu host pindah lagu (tanpa radio otomatis)
          if (isGuestSync()) {
            if (auto) engine.pause();
            else toast(GUEST_MSG);
            return;
          }
          if (auto && (s.sleepEnd || s.sleepSongs === 1)) {
            set({ sleepEnd: false, sleepSongs: 0 });
            engine.pause();
            toast('Timer tidur: pemutaran dijeda');
            return;
          }
          if (auto && s.sleepSongs > 1) set({ sleepSongs: s.sleepSongs - 1 });
          if (auto && s.repeat === 'one') {
            engine.seek(0);
            engine.play();
            return;
          }
          // offline: lompat ke lagu terunduh berikutnya
          const nx = findPlayable(s.queue, s.index + 1, 1, s.repeat === 'all');
          if (nx >= 0 && (nx > s.index || s.repeat === 'all')) return void start(s.queue, nx);
          if (!isOnline()) {
            engine.pause();
            if (!auto) toast('Tidak ada lagu terunduh berikutnya di antrean');
            return;
          }
          if (s.index < s.queue.length - 1) return void start(s.queue, s.index + 1);
          if (s.repeat === 'all' && s.queue.length) return void start(s.queue, 0);
          if (!useSettings.getState().autoplayRadio) {
            engine.pause();
            return;
          }
          const added = await extendWithRadio(s.current);
          const q = get().queue;
          if (added && s.index < q.length - 1) start(q, s.index + 1);
          else engine.pause();
        },
        prev: () => {
          const s = get();
          if (isGuestSync()) return void toast(GUEST_MSG);
          if (s.time > 3 || s.index <= 0) return void get().seek(0);
          const pv = findPlayable(s.queue, s.index - 1, -1);
          if (pv < 0) return void get().seek(0);
          start(s.queue, pv, -1);
        },
        seek: (sec) => {
          set({ time: sec });
          engine.seek(sec);
        },
        setVolume: (v) => {
          set({ volume: v, muted: v === 0 });
          engine.setVolume(v, v === 0);
        },
        toggleMute: () => {
          const s = get();
          set({ muted: !s.muted });
          engine.setVolume(s.volume, !s.muted);
        },
        toggleShuffle: () => {
          // siklus seperti Spotify: mati → acak → acak cerdas → mati
          const s = get();
          if (!s.current) return set({ shuffle: !s.shuffle, smart: false });
          if (!s.shuffle) {
            const rest = shuffled(s.queue.filter((_, i) => i !== s.index));
            set({ shuffle: true, smart: false, original: s.queue, queue: [s.current, ...rest], index: 0 });
          } else if (!s.smart) {
            set({ smart: true });
            smartify();
          } else {
            const orig = (s.original || s.queue).filter((t) => !t.rec);
            const i = orig.findIndex((t) => t.videoId === s.current!.videoId);
            if (i >= 0) set({ shuffle: false, smart: false, original: null, queue: orig, index: i });
            else set({ shuffle: false, smart: false, original: null, queue: [s.current, ...orig], index: 0 });
          }
        },
        cycleRepeat: () => set((s) => ({ repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' })),
        jumpTo: (i) => {
          if (isGuestSync()) return void toast(GUEST_MSG);
          start(get().queue, i);
        },
        addToQueue: (t) => {
          if (guestSuggest(t)) return;
          const s = get();
          if (!s.current) return get().playTrack(t);
          set({ queue: [...s.queue, t] });
        },
        playNext: (t) => {
          if (guestSuggest(t)) return;
          const s = get();
          if (!s.current) return get().playTrack(t);
          const q = [...s.queue];
          q.splice(s.index + 1, 0, t);
          set({ queue: q });
        },
        removeFromQueue: (i) => {
          const s = get();
          if (i === s.index || i < 0 || i >= s.queue.length) return;
          const q = s.queue.filter((_, k) => k !== i);
          set({ queue: q, index: i < s.index ? s.index - 1 : s.index });
        },
        clearQueue: () => {
          const s = get();
          set({ queue: s.current ? [s.current] : [], index: s.current ? 0 : -1 });
        },
        toggleLike: (t) =>
          set((s) => {
            if (s.liked.some((l) => l.videoId === t.videoId)) {
              markRemoved(`like:${t.videoId}`);
              return { liked: s.liked.filter((l) => l.videoId !== t.videoId) };
            }
            return { liked: [{ ...slim(t), addedAt: Date.now() }, ...s.liked] };
          }),
        setRightPanel: (p) => set((s) => ({ rightPanel: s.rightPanel === p ? null : p })),
        setFullPlayer: (open, tab = null) => set({ fullPlayer: open, fullTab: tab }),
        createPlaylist: (name, description, tags) => {
          const id = uid();
          const clean = (tags || []).map((t) => t.trim()).filter(Boolean).slice(0, 4);
          set((s) => ({ playlists: [{ id, name, description, tags: clean.length ? clean : undefined, createdAt: Date.now(), updatedAt: Date.now(), tracks: [] }, ...s.playlists] }));
          return id;
        },
        addToPlaylist: (id, t) =>
          set((s) => ({
            playlists: s.playlists.map((p) =>
              p.id === id && !p.tracks.some((x) => x.videoId === t.videoId) ? { ...p, tracks: [...p.tracks, slim(t)], updatedAt: Date.now() } : p,
            ),
          })),
        removeFromPlaylist: (id, videoId) =>
          set((s) => ({ playlists: s.playlists.map((p) => (p.id === id ? { ...p, tracks: p.tracks.filter((x) => x.videoId !== videoId), updatedAt: Date.now() } : p)) })),
        deletePlaylist: (id) => {
          markRemoved(`pl:${id}`);
          set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) }));
        },
        editPlaylist: (id, name, description) =>
          set((s) => ({ playlists: s.playlists.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name, description: description?.trim() || undefined, updatedAt: Date.now() } : p)) })),
        editPlaylistTags: (id, tags) =>
          set((s) => ({
            playlists: s.playlists.map((p) => {
              if (p.id !== id) return p;
              const clean = (tags || []).map((t) => t.trim()).filter(Boolean).slice(0, 4);
              return { ...p, tags: clean.length ? clean : undefined, updatedAt: Date.now() };
            }),
          })),
        clearHistory: () => {
          markRemoved('history');
          set({ history: [] });
        },
        moveInQueue: (from, to) => {
          const s = get();
          if (from === to || from < 0 || to < 0 || from >= s.queue.length || to >= s.queue.length) return;
          const q = [...s.queue];
          const [it] = q.splice(from, 1);
          q.splice(to, 0, it);
          let index = s.index;
          if (from === s.index) index = to;
          else if (from < s.index && to >= s.index) index--;
          else if (from > s.index && to <= s.index) index++;
          set({ queue: q, index });
        },
        setRate: (r) => {
          set({ rate: r });
          engine.setRate(r);
        },
        setLyricsOpen: (open) => {
          const s = get();
          if (open) set({ lyricsOpen: true, lyricsFromFull: s.fullPlayer, fullPlayer: false });
          else set({ lyricsOpen: false, fullPlayer: s.lyricsFromFull, lyricsFromFull: false });
        },
        keepRecommended: (i) =>
          set((s) => ({ queue: s.queue.map((t, k) => (k === i ? { ...t, rec: false } : t)) })),
        setSleepSongs: (n) => set({ sleepAt: null, sleepEnd: false, sleepSongs: Math.max(0, Math.floor(n)) }),
        setSleep: (min) => {
          if (min === null) set({ sleepAt: null, sleepEnd: false, sleepSongs: 0 });
          else if (min === 'end') set({ sleepAt: null, sleepEnd: true, sleepSongs: 0 });
          else set({ sleepAt: Date.now() + min * 60_000, sleepEnd: false, sleepSongs: 0 });
        },
        _sync: (p) => set(p),
      };
    },
    {
      name: 'sb-player',
      partialize: (s) => ({
        liked: s.liked, history: s.history, playlists: s.playlists, volume: s.volume, muted: s.muted, repeat: s.repeat,
        rightPanel: s.rightPanel, current: s.current, rate: s.rate, ...persistedQueue(s.queue, s.index),
      }),
    },
  ),
);

export const useIsLiked = (videoId?: string) => usePlayer((s) => !!videoId && s.liked.some((l) => l.videoId === videoId));
