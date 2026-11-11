/** Shortcut ikon aplikasi (tekan lama ikon) → deep link com.musickuzyy.streambeats://open/<aksi> */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { usePlayer } from '../store/player';
import { toast } from './toast';
import { listen } from './voice';

const Bridge = registerPlugin<{ addListener(e: 'shortcut', cb: (d: { path: string }) => void): Promise<unknown> }>('ExternalAuth');

export function handleShortcut(path: string, navigate: (to: string) => void) {
  const p = path.replace(/^\/+/, '');
  if (p === 'play-liked') {
    const liked = usePlayer.getState().liked;
    if (!liked.length) { toast('Belum ada lagu disukai'); return navigate('/liked'); }
    usePlayer.getState().playList(liked, 0, true);
    return navigate('/liked');
  }
  if (p === 'resume') {
    const s = usePlayer.getState();
    if (s.current && !s.playing) s.toggle();
    return;
  }
  if (p === 'search') {
    navigate('/search');
    setTimeout(() => listen().then((q) => q && navigate(`/search?q=${encodeURIComponent(q)}`)).catch((e) => toast(e.message)), 500);
    return;
  }
  const routes: Record<string, string> = { together: '/together', recap: '/recap' };
  if (routes[p]) navigate(routes[p]);
}

export function initShortcuts(navigate: (to: string) => void) {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('ExternalAuth')) return;
  void Bridge.addListener('shortcut', (d) => handleShortcut(d.path, navigate));
}
