/**
 * Pemutaran latar belakang di APK (Capacitor).
 * Plugin native "BackgroundPlayback" (android/app/src/main/java/.../BackgroundPlaybackPlugin.java) menjalankan
 * foreground service + notifikasi media, sehingga Android tidak menghentikan musik saat aplikasi diminimalkan
 * atau layar dikunci. Tombol di notifikasi / lock screen dikirim balik ke pemutar lewat event "action".
 * Di browser / PWA, hook ini tidak melakukan apa-apa (lihat auto-resume di engine.ts).
 */
import { useEffect } from 'react';
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { engine } from './engine';
import { artistNames } from './format';
import { img } from './img';
import { fetchLyrics, type LyricLine } from './lyrics';

interface NowPlaying {
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  playing: boolean;
  duration?: number;
  position?: number;
  liked?: boolean;
  shuffle?: boolean;
  /** baris lirik saat ini — menggantikan nama artis di notifikasi / dynamic island */
  lyric?: string;
}

interface BackgroundPlaybackPlugin {
  /** mulai / perbarui foreground service + notifikasi media */
  update(o: NowPlaying): Promise<void>;
  stop(): Promise<void>;
  /** minta izin notifikasi (Android 13+) */
  requestPermissions(): Promise<{ notifications: string }>;
  addListener(event: 'action', cb: (e: { action: 'play' | 'pause' | 'next' | 'prev' | 'stop' | 'seek' | 'like' | 'shuffle' | 'shuffle_on' | 'shuffle_off' | 'lyrics'; position?: number }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'lifecycle', cb: (e: { background: boolean }) => void): Promise<PluginListenerHandle>;
}

const Native = registerPlugin<BackgroundPlaybackPlugin>('BackgroundPlayback');

export const nativeBackgroundAvailable = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('BackgroundPlayback');

export function useBackgroundPlayback() {
  useEffect(() => {
    if (!nativeBackgroundAvailable()) return;
    const handles: Promise<PluginListenerHandle>[] = [];
    let asked = false;
    let lastKey = '';
    let active = false;
    let lyrTrack = '';
    let lyrLines: LyricLine[] | null = null;

    const lyricNow = (videoId: string, time: number) => {
      if (!useSettings.getState().islandLyrics) return '';
      if (lyrTrack !== videoId) {
        lyrTrack = videoId;
        lyrLines = null;
        const t = usePlayer.getState().current;
        if (t) fetchLyrics(t, usePlayer.getState().duration || undefined)
          .then((l) => { if (lyrTrack === videoId) { lyrLines = l.synced?.filter((x) => x.text) || null; sync(); } })
          .catch(() => {});
        return '';
      }
      if (!lyrLines?.length) return '';
      let line = '';
      for (const l of lyrLines) { if (l.time <= time + 0.25) line = l.text; else break; }
      return line;
    };

    const sync = () => {
      const s = usePlayer.getState();
      const enabled = useSettings.getState().bgPlay;
      if (!s.current || !enabled) {
        if (active) { Native.stop().catch(() => {}); active = false; lastKey = ''; }
        return;
      }
      const t = s.current;
      const liked = s.liked.some((l) => l.videoId === t.videoId);
      const lyric = lyricNow(t.videoId, s.time);
      const key = `${t.videoId}|${s.playing}|${Math.round(s.duration)}|${liked}|${s.shuffle}|${lyric}`;
      if (key === lastKey) return;
      lastKey = key;
      if (!asked && s.playing) { asked = true; Native.requestPermissions().catch(() => {}); }
      active = true;
      Native.update({
        title: t.title,
        artist: artistNames(t),
        album: t.album?.name,
        artwork: img(t.thumbnail, 512) || undefined,
        playing: s.playing || s.buffering,
        duration: s.duration || t.duration || 0,
        position: s.time,
        liked,
        shuffle: s.shuffle,
        lyric: lyric ? `♪ ${lyric}` : undefined,
      }).catch(() => {});
    };

    sync();
    const unsubPlayer = usePlayer.subscribe(sync);
    const unsubSettings = useSettings.subscribe(sync);

    handles.push(
      Native.addListener('action', ({ action, position }) => {
        const p = usePlayer.getState();
        if (action === 'play') engine.play();
        else if (action === 'pause') engine.pause();
        else if (action === 'next') p.next();
        else if (action === 'prev') p.prev();
        else if (action === 'seek' && position != null) p.seek(position);
        else if (action === 'like' && p.current) p.toggleLike(p.current);
        else if (action === 'shuffle') p.toggleShuffle();
        else if (action === 'shuffle_on') { if (!p.shuffle) p.toggleShuffle(); }
        else if (action === 'shuffle_off') { for (let i = 0; i < 2 && usePlayer.getState().shuffle; i++) usePlayer.getState().toggleShuffle(); }
        else if (action === 'lyrics' && p.current) { if (!p.lyricsOpen) p.setLyricsOpen(true); }
        else if (action === 'stop') { engine.pause(); Native.stop().catch(() => {}); active = false; lastKey = ''; }
      }),
    );
    // Bila "Putar di latar belakang" dimatikan: jeda saat aplikasi diminimalkan
    handles.push(
      Native.addListener('lifecycle', ({ background }) => {
        if (background && !useSettings.getState().bgPlay && usePlayer.getState().playing) engine.pause();
      }),
    );

    return () => {
      unsubPlayer();
      unsubSettings();
      handles.forEach((h) => h.then((x) => x.remove()));
    };
  }, []);
}
