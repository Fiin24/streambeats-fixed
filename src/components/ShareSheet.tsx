import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Check, Send, Mail, MoreHorizontal } from 'lucide-react';
import { useShareSheet, copyText } from '../lib/share';
import { isNativeApp } from '../lib/native';
import { toast } from '../lib/toast';

/** Logo WhatsApp sederhana (SVG) */
const WaIcon = () => (
  <svg viewBox="0 0 24 24" className="w-7 h-7" fill="white" aria-hidden>
    <path d="M12 2a9.9 9.9 0 0 0-8.5 15l-1.4 5 5.1-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.2Z" />
  </svg>
);

function Target({ label, bg, onClick, children }: { label: string; bg: string; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-2 min-w-0 active:scale-95 transition">
      <span className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white" style={{ background: bg }}>{children}</span>
      <span className="text-xs text-zinc-200 whitespace-nowrap">{label}</span>
    </button>
  );
}

/**
 * Lembar "Berbagi link" di dalam aplikasi (desktop / APK lama tanpa plugin NativeShare).
 * Di APK terbaru & browser HP yang tampil adalah lembar bagikan bawaan sistem.
 */
export default function ShareSheet() {
  const data = useShareSheet((s) => s.data);
  const close = useShareSheet((s) => s.close);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
    if (!data) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data, close]);

  if (!data) return null;
  const { url, title, text } = data;
  const msg = text ? `${text}\n${url}` : url;
  const enc = encodeURIComponent;

  const open = (link: string) => {
    // APK: link luar dibuka lewat Android (WhatsApp/Telegram langsung ke aplikasinya)
    if (isNativeApp()) window.location.href = link;
    else window.open(link, '_blank', 'noopener');
    close();
  };
  const copy = async () => {
    if (await copyText(msg)) { setCopied(true); toast('Link disalin'); setTimeout(close, 700); }
    else toast('Tidak bisa menyalin link');
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/55 animate-fade-in" onClick={close}>
      <div
        role="dialog"
        aria-label="Berbagi link"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] bg-[#221a1b] px-5 pt-3 pb-[max(env(safe-area-inset-bottom),24px)] sm:pb-6 animate-slide-up sm:animate-fade-in"
      >
        <div className="mx-auto w-10 h-1 rounded-full bg-white/25 mb-4" />
        <h3 className="text-lg font-medium">Berbagi link</h3>
        {title && <p className="text-sm text-zinc-400 truncate">{title}</p>}

        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/[.06] pl-4 pr-2 py-2">
          <p className="flex-1 min-w-0 truncate text-[15px] text-zinc-300">{url}</p>
          <button onClick={() => void copy()} aria-label="Salin link" className="p-2.5 rounded-full hover:bg-white/10 text-zinc-300">
            {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
          </button>
        </div>

        <div className="my-5 h-px bg-white/10" />

        <div className="grid grid-cols-5 gap-y-5 gap-x-2">
          <Target label="WhatsApp" bg="#25D366" onClick={() => open(`https://wa.me/?text=${enc(msg)}`)}><WaIcon /></Target>
          <Target label="Telegram" bg="#229ED9" onClick={() => open(`https://t.me/share/url?url=${enc(url)}${text ? `&text=${enc(text)}` : ''}`)}><Send className="w-6 h-6 -ml-0.5" /></Target>
          <Target label="X" bg="#000" onClick={() => open(`https://twitter.com/intent/tweet?url=${enc(url)}${text || title ? `&text=${enc(text || title || '')}` : ''}`)}><span className="text-2xl font-bold leading-none">𝕏</span></Target>
          <Target label="Facebook" bg="#1877F2" onClick={() => open(`https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`)}><span className="text-[28px] font-bold leading-none">f</span></Target>
          <Target label="Email" bg="#5f6368" onClick={() => open(`mailto:?subject=${enc(title || 'Stream Beats')}&body=${enc(msg)}`)}><Mail className="w-6 h-6" /></Target>
          {!!navigator.share && (
            <Target label="Lainnya" bg="#3c3c43" onClick={() => { close(); navigator.share(text ? { url, title, text } : { url }).catch(() => {}); }}><MoreHorizontal className="w-6 h-6" /></Target>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
