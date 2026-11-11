import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, CircleCheck, CircleAlert, ChevronDown } from 'lucide-react';
import Modal from './Modal';
import { usePlayer } from '../store/player';
import { useDownloads } from '../store/downloads';
import { fetchSpotify, matchAll, type SpCollection, type MatchResult } from '../lib/spotifyImport';
import type { Track } from '../lib/types';
import { uid } from '../lib/format';
import { toast } from '../lib/toast';

type Step = 'input' | 'loading' | 'preview' | 'matching' | 'done';

const slim = (t: Track): Track => ({
  type: t.type, id: t.videoId, videoId: t.videoId, title: t.title, subtitle: t.subtitle, artists: t.artists,
  thumbnail: t.thumbnail, album: t.album, duration: t.duration, durationText: t.durationText, explicit: t.explicit,
});

/** Simpan hasil impor sebagai playlist pribadi baru (sekali set, bukan per lagu) */
function savePlaylist(name: string, src: SpCollection, tracks: Track[]): string {
  const id = uid();
  const seen = new Set<string>();
  const unique = tracks.filter((t) => !seen.has(t.videoId) && (seen.add(t.videoId), true)).map(slim);
  usePlayer.setState((s) => ({
    playlists: [{ id, name, description: `Diimpor dari Spotify • ${src.url}`, createdAt: Date.now(), tracks: unique }, ...s.playlists],
  }));
  return id;
}

export default function SpotifyImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('input');
  const [url, setUrl] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<SpCollection | null>(null);
  const [name, setName] = useState('');
  const [alsoDownload, setAlsoDownload] = useState(false);
  const [progress, setProgress] = useState({ done: 0, found: 0 });
  const [result, setResult] = useState<{ id: string; added: number; missing: MatchResult[]; cancelled: boolean } | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const reset = () => {
    setStep('input'); setUrl(''); setErr(null); setData(null); setName(''); setResult(null);
    setProgress({ done: 0, found: 0 }); setShowMissing(false);
  };
  const close = () => {
    // pencocokan tetap berjalan di latar belakang bila jendela ditutup
    if (step === 'done' || step === 'input' || step === 'preview') reset();
    onClose();
  };

  const load = async () => {
    if (!url.trim()) return;
    setErr(null);
    setStep('loading');
    try {
      const d = await fetchSpotify(url);
      if (!d.tracks.length) throw new Error('Playlist kosong atau tidak bisa dibaca.');
      setData(d);
      setName(d.name);
      setStep('preview');
    } catch (e: any) {
      setErr(e?.message || 'Gagal membaca link Spotify');
      setStep('input');
    }
  };

  const start = async () => {
    if (!data) return;
    const ac = new AbortController();
    abort.current = ac;
    setStep('matching');
    setProgress({ done: 0, found: 0 });
    let found = 0;
    const results = await matchAll(data.tracks, (done, r) => {
      if (r.track) found++;
      setProgress({ done, found });
    }, ac.signal);
    const done = results.filter(Boolean);
    const matched = done.filter((r) => r.track).map((r) => r.track!) as Track[];
    const missing = done.filter((r) => !r.track);
    const cancelled = ac.signal.aborted;
    const plName = name.trim() || data.name;
    if (!matched.length) {
      setResult({ id: '', added: 0, missing, cancelled });
      setStep('done');
      return;
    }
    const id = savePlaylist(plName, data, matched);
    if (alsoDownload) useDownloads.getState().enqueue(matched);
    setResult({ id, added: matched.length, missing, cancelled });
    setStep('done');
    toast(`Playlist "${plName}" diimpor: ${matched.length} lagu${alsoDownload ? ' • mengunduh…' : ''}`);
  };

  const pct = data ? Math.round((progress.done / data.tracks.length) * 100) : 0;

  return (
    <Modal open={open} onClose={close} title="Impor dari Spotify">
      {(step === 'input' || step === 'loading') && (
        <div className="space-y-3">
          <p className="text-sm text-white/70">
            Tempel link <b>playlist</b>, <b>album</b>, atau <b>lagu</b> Spotify. Semua lagu dicocokkan ke YouTube Music lalu disimpan sebagai playlist baru.
          </p>
          <input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="https://open.spotify.com/playlist/…"
            inputMode="url"
            className="w-full bg-white/10 placeholder:text-white/40 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-white/30"
          />
          {err && <p className="flex gap-2 text-sm text-red-300"><CircleAlert className="w-4 h-4 shrink-0 mt-0.5" />{err}</p>}
          <p className="text-xs text-white/50">Di Spotify: buka playlist → ⋯ → Bagikan → Salin link. Playlist harus <b>Publik</b>.</p>
          <button
            onClick={load}
            disabled={!url.trim() || step === 'loading'}
            className="w-full py-3 rounded-full bg-[#FA243C] text-black font-bold disabled:opacity-40 hover:scale-[1.02] transition flex items-center justify-center gap-2"
          >
            {step === 'loading' && <Loader2 className="w-4 h-4 animate-spin" />} {step === 'loading' ? 'Membaca playlist…' : 'Lanjut'}
          </button>
        </div>
      )}

      {step === 'preview' && data && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {data.cover ? <img src={data.cover} alt="" referrerPolicy="no-referrer" className="w-16 h-16 rounded-md object-cover" /> : <div className="w-16 h-16 rounded-md bg-white/10" />}
            <div className="min-w-0">
              <p className="font-bold truncate">{data.name}</p>
              <p className="text-sm text-white/60 truncate">{data.owner ? `${data.owner} • ` : ''}{data.tracks.length} lagu</p>
            </div>
          </div>
          {data.partial && <p className="text-xs text-amber-300">Hanya {data.tracks.length} dari {data.total} lagu yang bisa dibaca.</p>}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama playlist"
            className="w-full bg-white/10 placeholder:text-white/40 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-white/30"
          />
          <label className="flex items-center gap-3 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={alsoDownload} onChange={(e) => setAlsoDownload(e.target.checked)} className="w-4 h-4 accent-[#FA243C]" />
            Unduh semua lagu agar bisa diputar offline
          </label>
          <div className="flex gap-2">
            <button onClick={reset} className="flex-1 py-3 rounded-full bg-white/10 font-semibold hover:bg-white/20">Kembali</button>
            <button onClick={start} className="flex-[2] py-3 rounded-full bg-[#FA243C] text-black font-bold hover:scale-[1.02] transition">Impor {data.tracks.length} lagu</button>
          </div>
        </div>
      )}

      {step === 'matching' && data && (
        <div className="space-y-4">
          <p className="text-sm text-white/70">Mencocokkan lagu dengan YouTube Music…</p>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-[#FA243C] transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-sm tabular-nums">
            <span>{progress.done} / {data.tracks.length}</span>
            <span className="text-white/60">{progress.found} cocok</span>
          </div>
          <button onClick={() => abort.current?.abort()} className="w-full py-3 rounded-full bg-white/10 font-semibold hover:bg-white/20">Hentikan & simpan yang sudah cocok</button>
          <p className="text-xs text-white/50">Boleh tutup jendela ini — proses tetap berjalan dan playlist disimpan otomatis.</p>
        </div>
      )}

      {step === 'done' && result && (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            {result.added ? <CircleCheck className="w-6 h-6 text-[#FA243C] shrink-0" /> : <CircleAlert className="w-6 h-6 text-red-300 shrink-0" />}
            <div>
              <p className="font-semibold">{result.added ? `${result.added} lagu ditambahkan ke "${name.trim() || data?.name}"` : 'Tidak ada lagu yang cocok'}</p>
              {result.cancelled && <p className="text-sm text-white/60">Dihentikan sebelum selesai.</p>}
              {result.missing.length > 0 && <p className="text-sm text-white/60">{result.missing.length} lagu tidak ditemukan di YouTube Music.</p>}
            </div>
          </div>
          {result.missing.length > 0 && (
            <div>
              <button onClick={() => setShowMissing((v) => !v)} className="flex items-center gap-1 text-sm text-white/70 hover:text-white">
                <ChevronDown className={`w-4 h-4 transition ${showMissing ? 'rotate-180' : ''}`} /> Lihat yang tidak ditemukan
              </button>
              {showMissing && (
                <ul className="mt-2 max-h-48 overflow-y-auto text-sm text-white/70 space-y-1 pr-1">
                  {result.missing.map((m, i) => <li key={i} className="truncate">• {m.source.title} — {m.source.artists.join(', ')}</li>)}
                </ul>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => { reset(); }} className="flex-1 py-3 rounded-full bg-white/10 font-semibold hover:bg-white/20">Impor lagi</button>
            {result.id ? (
              <button onClick={() => { const id = result.id; reset(); onClose(); navigate(`/my/${id}`); }} className="flex-[2] py-3 rounded-full bg-white text-black font-bold hover:scale-[1.02] transition">Buka playlist</button>
            ) : (
              <button onClick={close} className="flex-[2] py-3 rounded-full bg-white text-black font-bold">Tutup</button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
