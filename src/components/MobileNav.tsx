import { NavLink, useLocation } from 'react-router-dom';
import { Home, Search, Library } from 'lucide-react';
import { usePlayer } from '../store/player';
import { useCoverColor } from '../lib/color';
import { GlassLayers } from './Glass';

const TABS = [
  { to: '/', label: 'Beranda', icon: Home, end: true },
  { to: '/search', label: 'Cari', icon: Search },
  { to: '/library', label: 'Pustaka', icon: Library },
];

/** Navigasi bawah mobile — kapsul kaca melayang dengan indikator yang "mengalir" */
export default function MobileNav() {
  const { pathname } = useLocation();
  const current = usePlayer((s) => s.current);
  const tint = useCoverColor(current?.thumbnail, current?.videoId);
  const active = TABS.findIndex((t) => (t.end ? pathname === t.to : pathname.startsWith(t.to)));
  const n = TABS.length;
  return (
    <nav className="lg:hidden fixed z-30 left-3 right-3 bottom-[calc(env(safe-area-inset-bottom)+10px)]">
      <div className="lg relative h-[62px] rounded-full grid grid-cols-3 px-1.5" style={{ ['--tint' as any]: current ? tint : 'rgb(60 60 68)' }}>
        <GlassLayers />
        <span
          aria-hidden="true"
          className="lg-pill absolute top-1.5 bottom-1.5 rounded-full"
          style={{ left: `calc(6px + ${Math.max(0, active)} * ((100% - 12px) / ${n}))`, width: `calc((100% - 12px) / ${n})`, opacity: active < 0 ? 0 : 1 }}
        />
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `relative flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors ${isActive ? 'text-white' : 'text-white/55'}`}
          >
            {({ isActive }) => (
              <>
                <Icon className={`w-[22px] h-[22px] transition-transform ${isActive ? 'scale-110' : ''}`} strokeWidth={isActive ? 2.4 : 2} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
