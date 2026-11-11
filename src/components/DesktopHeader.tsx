import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Home, Crown, Settings, Users, Download, User } from 'lucide-react';
import { usePwa, promptInstall } from '../lib/pwa';
import SearchBox from './SearchBox';
import Modal from './Modal';
import { GlassLayers } from './Glass';
import { usePlayer } from '../store/player';
import { useCoverColor } from '../lib/color';
import Avatar from './Avatar';
import NotificationBell from './NotificationBell';
import { useAuth } from '../store/auth';

export default function DesktopHeader() {
  const navigate = useNavigate();
  const loc = useLocation();
  const [premium, setPremium] = useState(false);
  const canInstall = usePwa((s) => !!s.installEvt && !s.installed);
  const current = usePlayer((s) => s.current);
  const tint = useCoverColor(current?.thumbnail, current?.videoId);
  const icon = 'w-10 h-10 rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/10 transition';
  const glass = 'lg lg-soft relative rounded-full';
  return (
    <header
      className="hidden lg:flex h-20 shrink-0 items-center px-6 gap-4 relative z-30 transition-[background] duration-700"
      style={{ ['--tint' as any]: tint, background: `radial-gradient(55% 160% at 50% -60%, color-mix(in srgb, ${tint} 38%, transparent), transparent 70%)` }}
    >
      <div className="w-[278px] shrink-0">
        <div className={`${glass} inline-flex items-center gap-0.5 p-1`}>
          <GlassLayers />
          <button onClick={() => navigate(-1)} aria-label="Kembali" className={icon}><ChevronLeft className="w-5 h-5" /></button>
          <button onClick={() => navigate(1)} aria-label="Maju" className={icon}><ChevronRight className="w-5 h-5" /></button>
        </div>
      </div>
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <button
          onClick={() => navigate('/')}
          aria-label="Beranda"
          className={`${glass} w-12 h-12 shrink-0 flex items-center justify-center hover:scale-105 ${loc.pathname === '/' ? 'text-white' : 'text-zinc-400'}`}
        >
          <GlassLayers />
          <Home className="w-6 h-6" />
        </button>
        <SearchBox className="w-full max-w-[520px]" />
      </div>
      <div className="flex items-center gap-2 shrink-0 justify-end">
        {canInstall && (
          <button onClick={() => promptInstall()} className={`${glass} flex items-center gap-1.5 px-3.5 py-2 text-sm font-bold hover:scale-105`} title="Instal Stream Beats sebagai aplikasi">
            <GlassLayers />
            <Download className="w-4 h-4" /> Instal Aplikasi
          </button>
        )}
        <button onClick={() => setPremium(true)} className={`${glass} flex items-center gap-1.5 px-3.5 py-2 text-gold text-sm font-bold hover:scale-105`}>
          <GlassLayers />
          <Crown className="w-4 h-4" /> Premium
        </button>
        <div className={`${glass} flex items-center gap-0.5 p-1`}>
          <GlassLayers />
          
          <button onClick={() => navigate('/together')} aria-label="Dengar bersama" title="Dengar bersama — dengarkan musik bareng teman secara real time" className={`${icon} ${loc.pathname.startsWith('/together') ? 'text-white bg-white/10' : ''}`}><Users className="w-5 h-5" /></button>
          <NotificationBell className={icon} iconClass="w-5 h-5" />
          <button onClick={() => navigate('/settings')} aria-label="Pengaturan" title="Pengaturan" className={`${icon} ${loc.pathname.startsWith('/settings') ? 'text-white bg-white/10' : ''}`}><Settings className="w-5 h-5" /></button>
        </div>
        <button onClick={() => navigate('/profile')} aria-label="Profil" title={useAuth.getState().token ? `Profil — ${useAuth.getState().user.name}` : 'Profil'} className="ml-1 rounded-full ring-2 ring-white/25 shadow-lg hover:scale-105 transition">
          <Avatar size={40} />
        </button>
      </div>
      <Modal open={premium} onClose={() => setPremium(false)} title="Stream Beats Premium">
        <div className="space-y-3 text-sm text-zinc-300">
          <div className="rounded-xl p-4 bg-gradient-to-br from-gold/30 to-forest border border-gold/30">
            <p className="text-gold font-bold text-lg flex items-center gap-2"><Crown className="w-5 h-5" /> Sudah aktif — gratis!</p>
            <p className="mt-1">Semua fitur terbuka tanpa iklan dan tanpa biaya.</p>
          </div>
          <ul className="space-y-1.5 list-disc pl-5">
            <li>Streaming tanpa iklan</li>
            <li>Lirik tersinkron</li>
            <li>Antrean, shuffle &amp; repeat tanpa batas</li>
            <li>Playlist pribadi tersimpan di perangkat</li>
          </ul>
        </div>
      </Modal>
    </header>
  );
}
