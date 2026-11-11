import { useRef, useState } from 'react';

type Axis = 'x' | 'y';

/**
 * Gestur geser sederhana berbasis Pointer Events (sentuh & mouse).
 * Arah dikunci setelah 8px; klik dibatalkan bila jari sempat menggeser.
 */
export function useSwipe(axes: Axis[], onEnd: (axis: Axis, dist: number) => void) {
  const [d, setD] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const st = useRef<{ x: number; y: number; id: number; lock: Axis | 'none' | null } | null>(null);
  const last = useRef({ x: 0, y: 0 });
  const swiped = useRef(false);

  const reset = () => {
    st.current = null;
    last.current = { x: 0, y: 0 };
    setD({ x: 0, y: 0 });
  };

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      st.current = { x: e.clientX, y: e.clientY, id: e.pointerId, lock: null };
      swiped.current = false;
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = st.current;
      if (!s || s.id !== e.pointerId) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (!s.lock) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        const a: Axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        s.lock = axes.includes(a) ? a : 'none';
        if (s.lock !== 'none') {
          swiped.current = true;
          try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* abaikan */ }
        }
      }
      if (s.lock === 'x') last.current = { x: dx, y: 0 };
      else if (s.lock === 'y') last.current = { x: 0, y: dy * 0.9 };
      else return;
      setD(last.current);
    },
    onPointerUp: () => {
      const s = st.current;
      if (s?.lock === 'x' || s?.lock === 'y') onEnd(s.lock, s.lock === 'x' ? last.current.x : last.current.y);
      reset();
    },
    onPointerCancel: reset,
    onClickCapture: (e: React.MouseEvent) => {
      if (swiped.current) {
        e.stopPropagation();
        e.preventDefault();
        swiped.current = false;
      }
    },
  };
  return { dx: d.x, dy: d.y, dragging: d.x !== 0 || d.y !== 0, handlers };
}
