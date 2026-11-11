import { useRef, useState, useEffect, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Baris horizontal dengan tombol panah (desktop) dan swipe (mobile) */
export default function ScrollRow({ children, className = '', gap = 'gap-4' }: { children: ReactNode; className?: string; gap?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const update = () => {
    const el = ref.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);
  const go = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });
  return (
    <div className="relative group/row">
      <div ref={ref} onScroll={update} className={`flex overflow-x-auto no-scrollbar scroll-smooth snap-x ${gap} ${className}`}>
        {children}
      </div>
      {edges.left && (
        <button onClick={() => go(-1)} aria-label="Sebelumnya" className="hidden lg:flex absolute left-1 top-[40%] -translate-y-1/2 w-9 h-9 rounded-full bg-black/80 items-center justify-center opacity-0 group-hover/row:opacity-100 transition hover:scale-105">
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      {edges.right && (
        <button onClick={() => go(1)} aria-label="Berikutnya" className="hidden lg:flex absolute right-1 top-[40%] -translate-y-1/2 w-9 h-9 rounded-full bg-black/80 items-center justify-center opacity-0 group-hover/row:opacity-100 transition hover:scale-105">
          <ChevronRight className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
