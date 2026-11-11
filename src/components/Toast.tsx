import { useToast } from '../lib/toast';
import { GlassLayers } from './Glass';

export default function Toast() {
  const msg = useToast((s) => s.msg);
  if (!msg) return null;
  return (
    <div
      role="status"
      className="lg lg-dark fixed z-[60] left-1/2 -translate-x-1/2 bottom-[calc(156px+env(safe-area-inset-bottom))] lg:bottom-[112px] px-5 py-2.5 rounded-full text-white text-sm font-semibold animate-fade-in max-w-[90vw] text-center"
    >
      <GlassLayers />
      {msg}
    </div>
  );
}
