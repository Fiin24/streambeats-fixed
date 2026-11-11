import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { GlassLayers } from './Glass';

export default function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/45 animate-fade-in" onClick={onClose}>
      <div
        className="lg lg-dark relative w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] p-5 pb-8 sm:pb-5 animate-slide-up sm:animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <GlassLayers />
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="lg-btn p-1.5 rounded-full" aria-label="Tutup">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
