import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Shuffle, Trash2, CircleArrowDown, X, RefreshCw, HardDrive, WifiOff, FolderPlus, Loader2, Link2, Search, RotateCw, MessageSquare } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { usePlayer } from '../store/player';
import { useDownloads, fmtBytes } from '../store/downloads';
import TrackRow from '../components/TrackRow';
import Cover from '../components/Cover';
import { ProgressRing } from '../components/DownloadButton';
import { artistNames, fmtTime } from '../lib/format';
import { toast } from '../lib/toast';

export default function Downloads() {
  const playList = usePlayer((s) => s.playList);
  const { items, active, pending, failed, working } = useDownloads(useShallow((s) => ({ items: s.items, active: s.active, pending: s.pending, failed: s.failed, working: s.working })));
  const [quota, setQuota] = useState<{ usage: number; quota: number } | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setImporting(true);
    const n = await useDownloads.getState().importFiles(files);
    setImporting(false);
    toast(n ? `${n} lagu diimpor — bisa diputar offline` : 'Tidak ada file audio yang bisa diimpor');
  };

  const list = useMemo(() => Object.values(items).sort((a, b) => b.at - a.at), [items]);
  const tracks = useMemo(() => list.map((m) => m.track), [list]);
  const size = list.reduce((a, m) => a + m.size, 0);
  const dur = tracks.reduce((a, t) => a + (t.duration || 0), 0);
  const activeIds = Object.keys(active);
  const failedList = Object.entries(failed);

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setQuota({ usage: e.usage || 0, quota: e.quota || 0 })).catch(() => undefined);
  }, [list.length]);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const busyTrack = (id: string) => working[id] || pending.find((p) => p.videoId === id);

  return (
    <div className="pb-8">
      <div className="px-4 lg:px-6 pt-[max(env(safe-area-inset-top),24px)] pb-6 bg-gradient-to-b from-spotify/25 to-transparent">
        <div className="flex flex-col sm:flex-row sm:items-end gap-6">
          <div className="w-48 h-48 lg:w-56 lg:h-56 shrink-0 rounded-md bg-gradient-to-br from-[#FA243C] to-[#0b3d20] flex items-center justify-center shadow-2xl self-center sm:self-auto">
            <CircleArrowDown className="w-20 h-20" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Offline</p>
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight mt-1">Lagu Diunduh</h1>
            <p className="text-sm text-zinc-300 mt-2">
              {list.length} lagu{dur > 0 && `, ${fmtTime(dur)}`} • {fmtBytes(size)}
            </p>
            {quota && quota.quota > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-zinc-400 mt-1">
                <HardDrive className="w-3.5 h-3.5" /> Penyimpanan aplikasi: {fmtBytes(quota.usage)} dari ±{fmtBytes(quota.quota)} tersedia
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 lg:px-6">
        {!online && (
          <div className="flex items-center gap-2 text-sm bg-white/[.06] rounded-lg px-3 py-2 mb-2">
            <WifiOff className="w-4 h-4 shrink-0" /> Kamu sedang offline — lagu di bawah tetap bisa diputar.
          </div>
        )}
        <div className="flex items-center gap-4 py-5">
          <button onClick={() => playList(tracks)} disabled={!tracks.length} aria-label="Putar" className="w-14 h-14 rounded-full bg-brand flex items-center justify-center hover:scale-105 transition shadow-xl disabled:opacity-40">
            <Play className="w-6 h-6 fill-white ml-0.5" />
          </button>
          <button onClick={() => playList(tracks, 0, true)} disabled={!tracks.length} aria-label="Acak" className="p-2 text-zinc-300 hover:text-white disabled:opacity-40"><Shuffle className="w-7 h-7" /></button>
          <input ref={fileRef} type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.opus,.wav,.flac" multiple hidden onChange={onPick} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            title="Impor file musik milikmu dari perangkat"
            className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-50"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderPlus className="w-4 h-4" />} Impor file
          </button>
          {list.length > 0 && (
            <button
              onClick={() => { if (confirm(`Hapus semua ${list.length} lagu yang diunduh (${fmtBytes(size)})?`)) useDownloads.getState().clearAll().then(() => toast('Semua unduhan dihapus')); }}
              aria-label="Hapus semua unduhan"
              className="ml-auto flex items-center gap-2 text-sm px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20"
            >
              <Trash2 className="w-4 h-4" /> Hapus semua
            </button>
          )}
        </div>

        {(activeIds.length > 0 || pending.length > 0) && (
          <section className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold">Sedang mengunduh ({activeIds.length + pending.length})</h2>
              <button onClick={() => useDownloads.getState().cancelAll()} className="text-sm text-zinc-400 hover:text-white">Batalkan semua</button>
            </div>
            {[...activeIds.map((id) => ({ id, p: active[id] as number | null })), ...pending.map((t) => ({ id: t.videoId, p: null }))].slice(0, 30).map(({ id, p }) => {
              const t = busyTrack(id) || null;
              return <BusyRow key={id} id={id} title={t?.title} artist={t ? artistNames(t) : ''} thumb={t?.thumbnail} progress={p} />;
            })}
          </section>
        )}

        {failedList.length > 0 && (
          <section className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-red-300">Gagal diunduh ({failedList.length})</h2>
              <button onClick={() => useDownloads.getState().retryFailed()} className="flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white"><RefreshCw className="w-4 h-4" /> Coba lagi</button>
            </div>
            {failedList.some(([, f]) => /diblokir|semua sumber/i.test(f.error)) && (
              <p className="mb-2 rounded-xl bg-white/5 px-3 py-2.5 text-xs text-zinc-300 leading-relaxed">
                Sudah dicoba: YouTube langsung, mirror cadangan, dan unggahan lain dari lagu yang sama. Blokir YouTube biasanya terikat ke
                jaringan — coba <b>ganti jaringan</b> (Wi-Fi ↔ data seluler) lalu ketuk <b>Coba lagi</b>, atau tambahkan mirror sendiri di
                Pengaturan → Unduhan. File lagu milikmu juga bisa diimpor untuk diputar offline.
              </p>
            )}
            {failedList.slice(0, 20).map(([id, f]) => (
              <div key={id} className="flex items-center gap-3 px-2 py-2">
                <Cover src={f.track.thumbnail} size={120} className="w-10 h-10 shrink-0" rounded="rounded" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{f.track.title}</p>
                  <p className="truncate text-xs text-zinc-500">{f.error}</p>
                </div>
                <button
                  onClick={async () => {
                    const { findAlternatives } = await import('../lib/altSources');
                    const alts = await findAlternatives(f.track, 3);
                    if (!alts.length) return toast('Tidak ada versi lain ditemukan');
                    useDownloads.getState().enqueue(alts.slice(0, 1));
                    toast(`Mencoba versi lain: ${alts[0].title}`);
                  }}
                  title="Cari versi lain dari lagu ini"
                  className="p-2 rounded-full text-zinc-400 hover:text-orange-300 hover:bg-white/10"
                >
                  <Link2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => useDownloads.getState().enqueue([f.track])}
                  title="Coba unduh lagi"
                  className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
                <button onClick={() => useDownloads.getState().remove(id)} aria-label="Hapus" className="p-2 rounded-full text-zinc-400 hover:text-red-300 hover:bg-white/10"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </section>
        )}

        {list.length === 0 && activeIds.length === 0 && pending.length === 0 && (
          <div className="flex flex-col items-center text-center text-zinc-400 gap-3 py-16 px-6">
            <CircleArrowDown className="w-12 h-12" />
            <p className="font-semibold text-white">Belum ada lagu yang diunduh</p>
            <p className="text-sm max-w-sm">Ketuk ⋯ pada lagu → <b>Unduh</b>, atau tombol <CircleArrowDown className="inline w-4 h-4" /> di halaman playlist, album, atau Lagu Disukai. Lagu yang diunduh bisa diputar tanpa internet.</p>
            {failedList.length > 0 && (
              <div className="mt-4 p-4 rounded-xl bg-white/5 text-left max-w-sm text-xs text-zinc-300 space-y-2 border border-white/10">
                <p className="font-medium">Ada <b>{failedList.length}</b> lagu gagal diunduh.</p>
                <p>Coba ketuk tombol <Search className="inline w-3.5 h-3.5" /> "Cari Link Lain" di daftar gagal untuk mencari versi lain.</p>
                <p>Atau <button onClick={() => useDownloads.getState().retryFailed()} className="underline">coba unduh semua lagi</button> setelah ganti jaringan.</p>
              </div>
            )}
          </div>
        )}
        {tracks.map((t, i) => (
          <TrackRow key={t.videoId} track={t} index={i} context={tracks} onRemove={() => useDownloads.getState().remove(t.videoId)} />
        ))}
      </div>
    </div>
  );
}

function BusyRow({ id, title, artist, thumb, progress }: { id: string; title?: string; artist?: string; thumb?: string; progress: number | null }) {
  const item = useDownloads((s) => s.pending.find((p) => p.videoId === id));
  const t = title || item?.title || id;
  return (
    <div className="flex items-center gap-3 px-2 py-2">
      <Cover src={thumb || item?.thumbnail} size={120} className="w-10 h-10 shrink-0" rounded="rounded" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{t}</p>
        <p className="truncate text-xs text-zinc-400">{progress == null ? 'Menunggu…' : `${Math.round(progress * 100)}%`}{artist ? ` • ${artist}` : ''}</p>
      </div>
      {progress != null && <ProgressRing value={progress} size={22} />}
      <button onClick={() => useDownloads.getState().cancel(id)} aria-label="Batalkan" className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10"><X className="w-4 h-4" /></button>
    </div>
  );
}
