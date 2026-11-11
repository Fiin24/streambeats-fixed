import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, X, Clock, Mic, Loader2, ArrowUpLeft } from 'lucide-react';
import { voiceAvailable, listen } from '../lib/voice';
import { toast } from '../lib/toast';
import { suggest } from '../lib/api';
import type { Item } from '../lib/types';
import Cover from './Cover';
import { useItemActions } from '../lib/actions';
import { GlassLayers } from './Glass';
import { useSettings } from '../store/settings';

export const TYPE_LABEL: Record<string, string> = { song: 'Lagu', video: 'Video', artist: 'Artis', album: 'Album', playlist: 'Playlist' };

/** Tebalkan bagian saran yang belum diketik (gaya autocomplete mesin pencari) */
function Hl({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (!q || i < 0) return <span className="font-semibold">{text}</span>;
  return (
    <span>
      <span className="font-semibold">{text.slice(0, i)}</span>
      <span className="text-zinc-400">{text.slice(i, i + q.length)}</span>
      <span className="font-semibold">{text.slice(i + q.length)}</span>
    </span>
  );
}

type Opt = { kind: 'q'; text: string } | { kind: 'item'; item: Item };

export default function SearchBox({ className = '', autoFocus = false }: { className?: string; autoFocus?: boolean }) {
  const navigate = useNavigate();
  const loc = useLocation();
  const initial = new URLSearchParams(loc.search).get('q') || '';
  const [q, setQ] = useState(loc.pathname === '/search' ? initial : '');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const [sug, setSug] = useState<{ queries: string[]; items: Item[] }>({ queries: [], items: [] });
  const recent = useSettings((s) => s.recentSearches);
  const recentItems = useSettings((s) => s.recentItems);
  const addRecent = useSettings((s) => s.addRecent);
  const addRecentItem = useSettings((s) => s.addRecentItem);
  const { open: openItem } = useItemActions();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [voiceOk, setVoiceOk] = useState(false);
  const [hearing, setHearing] = useState(false);
  useEffect(() => { void voiceAvailable().then(setVoiceOk); }, []);

  useEffect(() => {
    if (loc.pathname === '/search') setQ(initial);
  }, [loc.pathname, initial]);

  useEffect(() => {
    const term = q.trim();
    setHi(-1);
    if (!term) return setSug({ queries: [], items: [] });
    const t = setTimeout(() => suggest(term).then(setSug).catch(() => {}), 220);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const h = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const go = (term: string) => {
    const t = term.trim();
    if (!t) return;
    addRecent(t);
    setQ(t);
    setOpen(false);
    input.current?.blur();
    navigate(`/search?q=${encodeURIComponent(t)}`);
  };
  const pickItem = (it: Item) => { addRecentItem(it); setOpen(false); openItem(it); };
  const term = q.trim();
  // saat kosong: pencarian terakhir + item yang terakhir dibuka; saat mengetik: saran kata + item
  const opts: Opt[] = term
    ? [...sug.queries.slice(0, 6).map((text) => ({ kind: 'q' as const, text })), ...sug.items.slice(0, 4).map((item) => ({ kind: 'item' as const, item }))]
    : [...recent.slice(0, 5).map((text) => ({ kind: 'q' as const, text })), ...recentItems.slice(0, 3).map((item) => ({ kind: 'item' as const, item: item as Item }))];
  const choose = (o: Opt) => (o.kind === 'q' ? go(o.text) : pickItem(o.item));
  const voice = async () => {
    setHearing(true);
    try { const t = await listen(); if (t) go(t); } catch (e: any) { toast(e.message); } finally { setHearing(false); }
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      if (!opts.length) return;
      setHi((h) => (e.key === 'ArrowDown' ? (h + 1) % opts.length : h <= 0 ? opts.length - 1 : h - 1));
    } else if (e.key === 'Enter') {
      if (open && hi >= 0 && opts[hi]) choose(opts[hi]);
      else go(q);
    } else if (e.key === 'Escape') setOpen(false);
  };
  const firstItem = opts.findIndex((o) => o.kind === 'item');

  return (
    <div ref={box} className={`relative ${className}`}>
      <span className="lg lg-soft absolute inset-x-0 top-0 h-12 rounded-full pointer-events-none" aria-hidden="true"><GlassLayers /></span>
      <Search className="absolute left-4 top-6 -translate-y-1/2 w-5 h-5 text-zinc-300 pointer-events-none" />
      <input
        ref={input}
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        role="combobox"
        aria-expanded={open && opts.length > 0}
        aria-autocomplete="list"
        enterKeyHint="search"
        placeholder="Cari lagu, artis, atau album"
        className="relative w-full h-12 pl-12 pr-10 rounded-full bg-transparent text-[15px] text-white placeholder:text-zinc-400 outline-none hover:bg-white/[.06] focus:ring-2 focus:ring-white/80 transition"
      />
      {q ? (
        <button onClick={() => { setQ(''); setOpen(true); input.current?.focus(); }} aria-label="Hapus" className="absolute right-3 top-6 -translate-y-1/2 p-1 text-zinc-300 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      ) : voiceOk && (
        <button onClick={() => void voice()} disabled={hearing} aria-label="Cari dengan suara" data-testid="voice-search-btn" className="absolute right-3 top-6 -translate-y-1/2 p-1 text-zinc-300 hover:text-white">
          {hearing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mic className="w-5 h-5" />}
        </button>
      )}
      {open && opts.length > 0 && (
        <div role="listbox" data-testid="search-suggestions" className="lg lg-dark absolute z-50 left-0 right-0 mt-2 rounded-2xl p-1.5 animate-fade-in">
          <GlassLayers />
          {!term && <p className="px-3 pt-1.5 pb-1 text-[11px] uppercase tracking-wider text-white/45">Terakhir</p>}
          {opts.map((o, i) => (
            <div key={o.kind === 'q' ? `q-${o.text}` : `i-${o.item.id}`}>
              {i === firstItem && i > 0 && <div className="h-px bg-white/10 my-1 mx-2" />}
              {o.kind === 'q' ? (
                <div role="option" aria-selected={hi === i} onMouseEnter={() => setHi(i)}
                  className={`group flex items-center rounded-xl ${hi === i ? 'bg-white/10' : ''}`}>
                  <button onClick={() => go(o.text)} className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2 text-left">
                    {term ? <Search className="w-4 h-4 text-zinc-400 shrink-0" /> : <Clock className="w-4 h-4 text-zinc-400 shrink-0" />}
                    <span className="truncate text-[15px]">{term ? <Hl text={o.text} q={term} /> : o.text}</span>
                  </button>
                  {/* isi kotak dengan saran ini tanpa langsung mencari */}
                  <button onClick={() => { setQ(o.text + ' '); input.current?.focus(); }} aria-label={`Lengkapi: ${o.text}`}
                    className="p-2 mr-1 rounded-lg text-zinc-500 hover:text-white"><ArrowUpLeft className="w-4 h-4" /></button>
                </div>
              ) : (
                <button role="option" aria-selected={hi === i} onMouseEnter={() => setHi(i)} onClick={() => pickItem(o.item)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left ${hi === i ? 'bg-white/10' : ''}`}>
                  <Cover src={o.item.thumbnail} size={96} className="w-10 h-10 shrink-0" rounded={o.item.type === 'artist' ? 'rounded-full' : 'rounded'} />
                  <div className="min-w-0">
                    <p className="truncate text-sm">{o.item.title}</p>
                    <p className="truncate text-xs text-zinc-400">{TYPE_LABEL[o.item.type] || o.item.type}{o.item.subtitle && ` · ${o.item.subtitle}`}</p>
                  </div>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
