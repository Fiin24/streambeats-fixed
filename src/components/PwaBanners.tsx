import { useState } from 'react';
import { WifiOff, RefreshCw, Download, Share, PlusSquare, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePwa, promptInstall, isIOS } from '../lib/pwa';
import { GlassLayers } from './Glass';

/** Pil kaca di atas: offline / versi baru tersedia */
export function PwaStatus() {
  const { offline, needRefresh, update } = usePwa();
  const [later, setLater] = useState(false);
  if (!offline && (!needRefresh || later)) return null;
  return (
    <div className="fixed z-[65] left-1/2 -translate-x-1/2 top-[max(env(safe-area-inset-top),10px)] lg:top-[88px] animate-fade-in max-w-[94vw]">
      <div role="status" className="lg lg-dark relative rounded-full flex items-center gap-2.5 pl-4 pr-1.5 py-1.5 text-sm font-semibold whitespace-nowrap">
        <GlassLayers />
        {offline ? (
          <>
            <WifiOff className="w-4 h-4 text-amber-300 shrink-0" />
            <span className="truncate">Offline</span>
            <Link to="/downloads" className="px-3 py-1 rounded-full bg-white text-black font-bold">Putar unduhan</Link>
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4 text-spotify shrink-0" />
            <span className="truncate">Versi baru tersedia</span>
            <button onClick={update} className="px-3 py-1 rounded-full bg-white text-black font-bold">Muat ulang</button>
            <button onClick={() => setLater(true)} aria-label="Nanti" className="lg-btn p-1.5 rounded-full"><X className="w-4 h-4" /></button>
          </>
        )}
      </div>
    </div>
  );
}

const DISMISS = 'sb-install-dismissed';

/** Kartu ajakan instal di Beranda (Chrome/Edge/Android: tombol instal, iPhone: petunjuk Bagikan) */
export function InstallCard() {
  const { installEvt, installed } = usePwa();
  const [hidden, setHidden] = useState(() => Date.now() - Number(localStorage.getItem(DISMISS) || 0) < 14 * 864e5);
  const ios = isIOS();
  if (installed || hidden || (!installEvt && !ios)) return null;
  const dismiss = () => { localStorage.setItem(DISMISS, String(Date.now())); setHidden(true); };
  return (
    <div className="lg relative rounded-[22px] flex items-center gap-3 p-3 mb-6 animate-fade-in" style={{ ['--tint' as any]: '#FA243C' }}>
      <GlassLayers />
      <img src="/pwa-192x192.png" alt="" className="w-12 h-12 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-bold leading-tight">Pasang Stream Beats</p>
        {ios ? (
          <p className="text-xs text-white/75 mt-0.5">
            Ketuk <Share className="inline w-3.5 h-3.5 -mt-0.5" /> Bagikan lalu <b>Tambahkan ke Layar Utama</b> <PlusSquare className="inline w-3.5 h-3.5 -mt-0.5" />
          </p>
        ) : (
          <p className="text-xs text-white/75 mt-0.5">Buka dari layar utama, layar penuh, tetap bisa dibuka saat offline</p>
        )}
      </div>
      {!ios && (
        <button onClick={() => promptInstall()} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-black text-sm font-bold hover:scale-105 transition shrink-0">
          <Download className="w-4 h-4" /> Instal
        </button>
      )}
      <button onClick={dismiss} aria-label="Tutup" className="lg-btn p-1.5 rounded-full shrink-0"><X className="w-4 h-4" /></button>
    </div>
  );
}
