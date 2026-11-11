import { useNavigate } from 'react-router-dom';
import { Settings, History } from 'lucide-react';
import NotificationBell from './NotificationBell';
import { greeting } from '../lib/format';
import Avatar from './Avatar';
import { useAuth, firstName } from '../store/auth';
import { GlassLayers } from './Glass';
import { usePlayer } from '../store/player';
import { useCoverColor } from '../lib/color';

/** Header mobile: bar kaca melayang yang menempel di atas saat konten digulir */
export default function MobileHeader({ title = 'Beranda', subtitle }: { title?: string; subtitle?: string }) {
  const navigate = useNavigate();
  const name = useAuth((s) => (s.token ? firstName(s.user.name) : ''));
  const current = usePlayer((s) => s.current);
  const tint = useCoverColor(current?.thumbnail, current?.videoId);
  const btn = 'w-10 h-10 rounded-full flex items-center justify-center text-zinc-100 hover:bg-white/10 active:scale-95 transition';
  return (
    <div className="lg:hidden sticky top-0 z-20 -mx-3 px-3 pt-[max(env(safe-area-inset-top),10px)] pb-2">
      <div className="lg relative rounded-[24px] flex items-center gap-2.5 p-1.5 pl-2" style={{ ['--tint' as any]: tint }}>
        <GlassLayers />
        <button onClick={() => navigate('/profile')} aria-label="Profil" className="rounded-full active:scale-95 transition"><Avatar size={40} /></button>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-white/70 leading-tight">{subtitle ?? `${greeting()}${name ? `, ${name}` : ''}`}</p>
          <h1 className="text-[17px] font-bold leading-tight truncate">{title}</h1>
        </div>
        <NotificationBell className={btn} iconClass="w-[22px] h-[22px]" />
        <button onClick={() => navigate('/history')} aria-label="Riwayat" className={btn}><History className="w-[22px] h-[22px]" /></button>
        <button onClick={() => navigate('/settings')} aria-label="Pengaturan" className={btn}><Settings className="w-[22px] h-[22px]" /></button>
      </div>
    </div>
  );
}
