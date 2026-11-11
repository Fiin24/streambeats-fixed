import { useState } from 'react';
import { X, GripVertical, Sparkles, Plus } from 'lucide-react';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import Cover from './Cover';
import Eq from './Eq';
import { artistNames, fmtTime } from '../lib/format';

export default function QueueView() {
  const { queue, index, current, playing, jumpTo, removeFromQueue, clearQueue, moveInQueue, keepRecommended, toggleLike, smart } = usePlayer();
  const autoplayRadio = useSettings((s) => s.autoplayRadio);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  if (!current) return <p className="text-zinc-400 text-center mt-10">Antrean kosong</p>;
  const upcoming = queue.slice(index + 1);
  const total = upcoming.reduce((a, t) => a + (t.duration || 0), 0);

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-qi]');
    if (el) {
      const over = Number(el.getAttribute('data-qi'));
      if (over !== drag.over) setDrag({ ...drag, over });
    }
  };
  const onDrop = () => {
    if (drag && drag.over !== drag.from) moveInQueue(index + 1 + drag.from, index + 1 + drag.over);
    setDrag(null);
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="font-bold mb-2">Sedang diputar</p>
        <div className="flex items-center gap-3 p-2 rounded-md bg-white/[.06]">
          <Cover src={current.thumbnail} size={120} className="w-12 h-12" rounded="rounded" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-spotify">{current.title}</p>
            <p className="truncate text-sm text-zinc-400">{artistNames(current)}</p>
          </div>
          <Eq playing={playing} className="mr-2" />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="font-bold flex items-center gap-2">Berikutnya{smart && <span className="inline-flex items-center gap-1 text-xs font-semibold text-spotify"><Sparkles className="w-3.5 h-3.5" /> Acak cerdas</span>}</p>
            {upcoming.length > 0 && (
              <p className="text-xs text-zinc-400">{upcoming.length} lagu{total > 0 ? ` • ${fmtTime(total)}` : ''} • seret <GripVertical className="inline w-3 h-3 -mt-0.5" /> untuk mengatur urutan</p>
            )}
          </div>
          {upcoming.length > 0 && <button onClick={clearQueue} className="text-sm text-zinc-400 hover:text-white">Kosongkan</button>}
        </div>
        {upcoming.length === 0 && (
          <p className="text-sm text-zinc-500">
            {autoplayRadio ? 'Tidak ada lagu berikutnya. Radio otomatis akan dimuat saat lagu selesai.' : 'Tidak ada lagu berikutnya. Radio otomatis sedang mati (Pengaturan).'}
          </p>
        )}
        {upcoming.map((t, k) => {
          const isDrag = drag?.from === k;
          const isOver = drag && drag.over === k && drag.over !== drag.from;
          const line = isOver ? (drag!.over > drag!.from ? 'shadow-[inset_0_-2px_0_#FA243C]' : 'shadow-[inset_0_2px_0_#FA243C]') : '';
          return (
            <div
              key={`${t.videoId}-${k}`}
              data-qi={k}
              onClick={() => !drag && jumpTo(index + 1 + k)}
              className={`group flex items-center gap-2 p-2 rounded-md hover:bg-white/[.07] cursor-pointer transition ${isDrag ? 'opacity-40 bg-white/[.07]' : ''} ${line}`}
            >
              <button
                aria-label="Seret untuk memindahkan"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  setDrag({ from: k, over: k });
                }}
                onPointerMove={onMove}
                onPointerUp={onDrop}
                onPointerCancel={() => setDrag(null)}
                style={{ touchAction: 'none' }}
                className="p-1 -ml-1 text-zinc-500 hover:text-white cursor-grab active:cursor-grabbing"
              >
                <GripVertical className="w-4 h-4" />
              </button>
              <Cover src={t.thumbnail} size={120} className="w-12 h-12 shrink-0" rounded="rounded" />
              <div className="min-w-0 flex-1">
                <p className="truncate">{t.title}</p>
                <p className="truncate text-sm text-zinc-400">
                  {t.rec && (
                    <span className="inline-flex items-center gap-1 mr-1.5 px-1.5 py-px rounded-full bg-spotify/15 text-spotify text-[11px] font-semibold align-[1px]">
                      <Sparkles className="w-3 h-3" /> Disarankan
                    </span>
                  )}
                  {artistNames(t)}
                </p>
              </div>
              {t.rec && (
                <button
                  onClick={(e) => { e.stopPropagation(); keepRecommended(index + 1 + k); toggleLike(t); }}
                  aria-label="Simpan ke Lagu Disukai"
                  title="Simpan ke Lagu Disukai"
                  className="p-1.5 rounded-full text-zinc-300 hover:text-white border border-white/20 hover:border-white"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); removeFromQueue(index + 1 + k); }}
                aria-label="Hapus dari antrean"
                className="p-1.5 rounded-full text-zinc-400 hover:text-white sm:opacity-0 group-hover:opacity-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
