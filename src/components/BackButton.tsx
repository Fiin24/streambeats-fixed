import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/** halaman detail (dibuka dari lagu/artis/album) yang tidak punya header sendiri di mobile */
const DETAIL = /^\/(artist|album|playlist|my|mix)\/[^/]+|^\/(liked|history)$|^\/u\/[^/]+\/p\/[^/]+/;

/** Tombol kembali melayang (mobile) → kembali ke menu sebelumnya, atau Beranda bila dibuka langsung */
export default function BackButton() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (!DETAIL.test(pathname)) return null;
  const back = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/', { replace: true }));
  return (
    <button
      onClick={back}
      aria-label="Kembali"
      className="lg:hidden fixed z-30 left-3 top-[calc(max(env(safe-area-inset-top),10px)+4px)] w-10 h-10 rounded-full flex items-center justify-center
        bg-black/45 backdrop-blur-md border border-white/10 text-white shadow-lg active:scale-90 transition"
    >
      <ArrowLeft className="w-[22px] h-[22px]" />
    </button>
  );
}
