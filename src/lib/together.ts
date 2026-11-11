/**
 * Dengar bersama — klien.
 *  • Host  : membuat ruangan, mengirim status pemutar (lagu, putar/jeda, posisi, kecepatan, volume) setiap ada
 *            perubahan + detak tiap 5 dtk; polling tiap 3 dtk untuk permintaan bergabung & saran lagu.
 *  • Tamu  : bergabung dengan kode, polling tiap 2 dtk lalu menyamakan lagu & posisi dengan host
 *            (selisih jam HP ↔ server dikoreksi otomatis). Memilih lagu saat menjadi tamu = menyarankan ke host.
 * Server: /api/together (api/_lib/together.ts). URL server bisa diganti di Pengaturan Dengar bersama.
 */
import type { Track } from './types';
import { usePlayer } from '../store/player';
import { engine } from './engine';
import { toast } from './toast';
import { useTogether, togetherHooks, type TogetherMember, type TogetherRole, type TogetherSuggestion } from '../store/together';

const GUEST_POLL = 1000;
const GUEST_POLL_FAST = 400; // sesaat setelah host ganti lagu/putar/jeda
const HOST_POLL = 3000;
const HEARTBEAT = 5000;
const SESSION_MAX_AGE = 6 * 3600 * 1000;
const DRIFT_SEEK = 0.8; // detik — selisih lebih dari ini dikoreksi
const SEEK_LEAD = 0.35; // perkiraan waktu yang dibutuhkan player untuk melompat

const T = () => useTogether.getState();
const log = (msg: string, level: 'info' | 'warn' | 'error' = 'info') => T().log(msg, level);

/* ───────────────────────────── jaringan ───────────────────────────── */

export function serverBase(url = T().serverUrl): string {
  const u = url.trim().replace(/\/+$/, '');
  if (!u) return '/api/together';
  return /\/api\/together$/.test(u) ? u : `${u}/api/together`;
}

class ApiError extends Error {
  constructor(public status: number, message: string, public data: any = {}) { super(message); }
}

/** perkiraan selisih jam server − jam HP (ms) */
let offset = 0;
let bestRtt = Infinity;
let offsetAt = 0;

async function api<R = any>(action: string, body: Record<string, unknown> = {}, timeoutMs = 9000): Promise<R> {
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const r = await fetch(`${serverBase()}?action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
      cache: 'no-store',
    });
    const t1 = Date.now();
    const data: any = await r.json().catch(() => ({}));
    if (typeof data?.now === 'number') {
      const rtt = t1 - t0;
      // sampel dengan ping terkecil paling akurat; perbarui juga bila sampel lama sudah basi
      if (rtt <= bestRtt * 1.25 || t1 - offsetAt > 60_000) {
        bestRtt = Math.min(rtt, bestRtt * 1.25);
        offset = data.now - (t0 + t1) / 2;
        offsetAt = t1;
      }
      T().set({ rtt });
    }
    if (!r.ok) throw new ApiError(r.status, data?.error || `Server membalas ${r.status}`, data);
    return data as R;
  } catch (e: any) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, e?.name === 'AbortError' ? 'Server tidak merespons (timeout)' : 'Tidak bisa menghubungi server Dengar bersama');
  } finally {
    clearTimeout(timer);
  }
}

/** Cek server (dipakai di pengaturan URL Server) */
export async function testServer(url: string): Promise<{ ok: boolean; msg: string }> {
  try {
    const t0 = Date.now();
    const r = await fetch(`${serverBase(url)}?action=status`, { cache: 'no-store' });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) return { ok: false, msg: 'Bukan server Dengar bersama Stream Beats' };
    if (!j.ready) return { ok: false, msg: 'Server aktif tetapi database belum diatur (Upstash)' };
    return { ok: true, msg: `Tersambung • ${Date.now() - t0} ms` };
  } catch {
    return { ok: false, msg: 'Tidak bisa menghubungi server' };
  }
}

/* ───────────────────────────── utilitas ───────────────────────────── */

const slim = (t: Track): Track => ({
  type: 'song', id: t.videoId, videoId: t.videoId, title: t.title, subtitle: t.subtitle, artists: t.artists,
  thumbnail: t.thumbnail, album: t.album, duration: t.duration, durationText: t.durationText, explicit: t.explicit,
} as Track);

const isBlocked = (m: { name: string; dev?: string }) =>
  T().blocked.some((b) => (b.dev && m.dev && b.dev === m.dev) || b.name.toLowerCase() === m.name.toLowerCase());

let timers: number[] = [];
let unsubs: (() => void)[] = [];
let failStreak = 0;
let alive = 0; // naik tiap sesi baru → loop sesi lama berhenti sendiri

function stopLoops() {
  timers.forEach((t) => clearInterval(t));
  unsubs.forEach((u) => u());
  timers = [];
  unsubs = [];
  failStreak = 0;
  alive++;
}

function resetState() {
  const s = T();
  const lastRoom = s.roomHistory.length && s.code ? { code: s.code, at: Date.now(), tracks: s.roomHistory } : s.lastRoom;
  T().set({ status: 'idle', role: null, code: '', hostName: '', members: [], suggestions: [], queue: [], roomHistory: [], lastRoom, error: null, hostStale: false, localHold: false, session: null });
}

function netFail(e: ApiError, what: string) {
  failStreak++;
  log(`${what} gagal: ${e.message}`, 'warn');
  if (failStreak >= 3) T().set({ error: 'Koneksi ke server terputus — mencoba lagi…' });
}
function netOk() {
  if (failStreak >= 3) log('Koneksi pulih');
  failStreak = 0;
  if (T().error) T().set({ error: null });
}

const CONNECT_TRIES = 3;
/** Coba ulang otomatis bila server tidak terjangkau / error 5xx */
async function withRetry<R>(fn: () => Promise<R>): Promise<R> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e: any) {
      const retryable = e instanceof ApiError && (e.status === 0 || e.status >= 500);
      if (!retryable || i >= CONNECT_TRIES) throw e;
      log(`Gagal terhubung (${e.message}) — mencoba lagi ${i + 1}/${CONNECT_TRIES}…`, 'warn');
      T().set({ error: `Gagal terhubung — mencoba lagi (${i + 1}/${CONNECT_TRIES})…` });
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

/* ───────────────────────────── HOST ───────────────────────────── */

let seq = 0;
let lastSent: { vid: string | null; playing: boolean; rate: number; volume: number | null; pos: number; at: number } | null = null;
let pushTimer: number | undefined;
let pushing = false;
/** antrean/riwayat berubah → ikut dikirim di push berikutnya */
let qDirty = true;
let lastQSig = '';
const seenPending = new Set<string>();
const seenSugg = new Set<string>();

function hostSnapshot() {
  const p = usePlayer.getState();
  const volume = T().syncVolume ? (p.muted ? 0 : p.volume) : null;
  return { vid: p.current?.videoId || null, track: p.current ? slim(p.current) : null, playing: p.playing, rate: p.rate || 1, volume, pos: engine.currentTime() || p.time || 0 };
}

async function pushNow(reason: string) {
  const s = T();
  if (s.role !== 'host' || !s.session) return;
  if (pushing) { schedulePush(reason, 300); return; }
  pushing = true;
  const snap = hostSnapshot();
  const sendQ = qDirty;
  qDirty = false;
  const q = sendQ ? { v: `${Date.now().toString(36)}${seq}`, queue: s.queue.map(slim), history: s.roomHistory.slice(-100).map(slim) } : undefined;
  const body = { code: s.code, key: s.session.key, playback: { track: snap.track, playing: snap.playing, pos: snap.playing && isFinite(bestRtt) ? snap.pos + Math.min(bestRtt, 1500) / 2000 * snap.rate : snap.pos, rate: snap.rate, volume: snap.volume, seq: ++seq }, q };
  try {
    await api('update', body);
    lastSent = { vid: snap.vid, playing: snap.playing, rate: snap.rate, volume: snap.volume, pos: snap.pos, at: Date.now() };
    netOk();
    if (reason !== 'detak') log(`Status dikirim (${reason}) • ${snap.track ? snap.track.title : 'tidak ada lagu'} • ${snap.playing ? 'putar' : 'jeda'} @${snap.pos.toFixed(1)}s`);
  } catch (e: any) {
    if (sendQ) qDirty = true;
    if (e?.data?.closed) return endSession('Sesi sudah berakhir di server');
    netFail(e, 'Kirim status');
  } finally {
    pushing = false;
  }
}
function schedulePush(reason: string, ms = 250) {
  clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => void pushNow(reason), ms);
}

/** Dipanggil setiap status pemutar berubah: kirim bila ada perubahan berarti */
function hostWatch() {
  const snap = hostSnapshot();
  const p = usePlayer.getState();
  // riwayat ruangan: catat setiap lagu baru yang diputar host
  const hist = T().roomHistory;
  if (p.current && hist[hist.length - 1]?.videoId !== p.current.videoId) {
    T().set({ roomHistory: [...hist, slim(p.current)].slice(-100) });
    qDirty = true;
  }
  // antrean berikutnya (dibagikan ke tamu)
  const upcoming = p.index >= 0 ? p.queue.slice(p.index + 1, p.index + 31) : [];
  const sig = upcoming.map((x) => x.videoId).join(',');
  if (sig !== lastQSig) {
    lastQSig = sig;
    T().set({ queue: upcoming });
    qDirty = true;
    if (lastSent && snap.vid === lastSent.vid) return schedulePush('antrean', 600);
  }
  const ls = lastSent;
  if (!ls) return schedulePush('awal');
  if (snap.vid !== ls.vid) return schedulePush('ganti lagu', 0);
  if (snap.playing !== ls.playing) return schedulePush(snap.playing ? 'putar' : 'jeda', 0);
  if (snap.rate !== ls.rate) return schedulePush('kecepatan');
  if (snap.volume !== ls.volume && (snap.volume == null || ls.volume == null || Math.abs(snap.volume - ls.volume) > 0.01)) return schedulePush('volume', 500);
  const expected = ls.pos + (ls.playing ? ((Date.now() - ls.at) / 1000) * ls.rate : 0);
  if (Math.abs(snap.pos - expected) > 1) schedulePush('geser posisi', 0);
}

async function hostPoll(myRun: number) {
  const s = T();
  if (s.role !== 'host' || !s.session) return;
  try {
    const r = await api<{ members: TogetherMember[]; suggestions: TogetherSuggestion[] }>('poll', { role: 'host', code: s.code, key: s.session.key });
    if (myRun !== alive) return;
    netOk();
    const members = r.members || [];
    // permintaan bergabung
    for (const m of members.filter((x) => x.status === 'pending')) {
      if (isBlocked(m)) {
        log(`Permintaan dari ${m.name} ditolak otomatis (diblokir)`);
        void memberAction(m.id, 'reject', true);
        continue;
      }
      if (T().autoApproveJoin) {
        log(`${m.name} disetujui otomatis`);
        void memberAction(m.id, 'approve', true);
        continue;
      }
      if (!seenPending.has(m.id)) {
        seenPending.add(m.id);
        toast(location.pathname.startsWith('/together') ? `${m.name} ingin bergabung` : `${m.name} ingin bergabung — buka Dengar bersama untuk menyetujui`);
        log(`Permintaan bergabung dari ${m.name}`);
      }
    }
    // tamu yang sudah disetujui lalu diblokir (mis. dari perangkat lain)
    for (const m of members.filter((x) => x.status === 'approved' && isBlocked(x))) void memberAction(m.id, 'kick', true);
    const before = new Set(T().members.filter((m) => m.status === 'approved').map((m) => m.id));
    for (const m of members.filter((x) => x.status === 'approved' && !before.has(x.id) && !isBlocked(x))) {
      if (T().members.length || seenPending.has(m.id)) toast(`${m.name} bergabung`);
      log(`${m.name} bergabung`);
    }
    // tamu yang keluar sendiri (musik host tetap berjalan)
    const nowIds = new Set(members.map((m) => m.id));
    for (const m of T().members.filter((x) => x.status === 'approved' && !nowIds.has(x.id))) {
      toast(`${m.name} keluar dari sesi`);
      log(`${m.name} keluar`);
    }
    // saran lagu
    const sugg = (r.suggestions || []).filter((g) => g.track?.videoId);
    const keep: TogetherSuggestion[] = [];
    for (const g of sugg) {
      if (T().autoApproveSuggest) {
        void respondSuggestion(g, true, true);
        continue;
      }
      keep.push(g);
      if (!seenSugg.has(g.id)) {
        seenSugg.add(g.id);
        toast(`${g.byName} menyarankan “${g.track.title}”`);
        log(`Saran lagu dari ${g.byName}: ${g.track.title}`);
      }
    }
    T().set({ members: members.filter((m) => !isBlocked(m)), suggestions: keep });
  } catch (e: any) {
    if (myRun !== alive) return;
    if (e?.data?.closed || e?.status === 403) return endSession('Sesi sudah berakhir di server');
    netFail(e, 'Polling host');
  }
}

function startHostLoops() {
  stopLoops();
  const myRun = alive;
  lastSent = null;
  qDirty = true;
  lastQSig = '';
  seenPending.clear();
  seenSugg.clear();
  unsubs.push(usePlayer.subscribe(() => hostWatch()));
  // pengaturan host berubah → beri tahu server (setujui otomatis, sinkron volume)
  unsubs.push(useTogether.subscribe((s, prev) => {
    if (s.autoApproveJoin !== prev.autoApproveJoin || s.autoApproveSuggest !== prev.autoApproveSuggest || s.syncVolume !== prev.syncVolume) {
      void pushSettings();
      if (s.syncVolume !== prev.syncVolume) schedulePush('volume');
    }
  }));
  timers.push(window.setInterval(() => void hostPoll(myRun), HOST_POLL));
  timers.push(window.setInterval(() => void pushNow('detak'), HEARTBEAT));
  void pushNow('awal');
  void hostPoll(myRun);
}

async function pushSettings() {
  const s = T();
  if (s.role !== 'host' || !s.session) return;
  try {
    await api('update', { code: s.code, key: s.session.key, settings: { autoJoin: s.autoApproveJoin, autoSuggest: s.autoApproveSuggest, syncVolume: s.syncVolume } });
    log('Pengaturan ruangan diperbarui');
  } catch (e: any) {
    netFail(e, 'Simpan pengaturan');
  }
}

export async function memberAction(memberId: string, op: 'approve' | 'reject' | 'kick', silent = false) {
  const s = T();
  if (s.role !== 'host' || !s.session) return;
  const m = s.members.find((x) => x.id === memberId);
  try {
    await api('member', { code: s.code, key: s.session.key, memberId, op });
    if (op === 'approve') {
      T().set({ members: T().members.map((x) => (x.id === memberId ? { ...x, status: 'approved' } : x)) });
      schedulePush('tamu baru', 100);
    } else T().set({ members: T().members.filter((x) => x.id !== memberId) });
    if (!silent && m) toast(op === 'approve' ? `${m.name} disetujui` : op === 'reject' ? `Permintaan ${m.name} ditolak` : `${m.name} dikeluarkan`);
    log(`${op === 'approve' ? 'Setujui' : op === 'reject' ? 'Tolak' : 'Keluarkan'}: ${m?.name || memberId}`);
  } catch (e: any) {
    if (!silent) toast(e.message);
    log(`Aksi tamu gagal: ${e.message}`, 'warn');
  }
}

export function blockMember(m: TogetherMember) {
  T().block({ name: m.name, dev: m.dev });
  void memberAction(m.id, m.status === 'pending' ? 'reject' : 'kick', true);
  toast(`${m.name} diblokir`);
}

export async function respondSuggestion(g: TogetherSuggestion, accept: boolean, auto = false) {
  const s = T();
  if (s.role !== 'host' || !s.session) return;
  T().set({ suggestions: T().suggestions.filter((x) => x.id !== g.id) });
  if (accept) {
    const p = usePlayer.getState();
    if (!p.current) p.playTrack(g.track);
    else p.addToQueue(g.track);
    toast(auto ? `Saran ${g.byName} masuk antrean: ${g.track.title}` : `“${g.track.title}” ditambahkan ke antrean`);
  }
  log(`${accept ? (auto ? 'Saran disetujui otomatis' : 'Saran disetujui') : 'Saran ditolak'}: ${g.track.title} (dari ${g.byName})`);
  try {
    await api('suggestion', { code: s.code, key: s.session.key, sid: g.id });
  } catch (e: any) {
    log(`Hapus saran gagal: ${e.message}`, 'warn');
  }
}

/* ───────────────────────────── TAMU ───────────────────────────── */

interface Playback { track: Track | null; playing: boolean; pos: number; rate: number; volume: number | null; ts: number; seq: number }
let lastLoad = { vid: '', at: 0 };
let loadFixed = true;
let fastUntil = 0;
let lastPbKey = '';
let lastSeek = 0;
let lastPlayTry = 0;
let wasApproved = false;
let lastQv = '';

function expectedPos(pb: Playback) {
  if (!pb.playing) return pb.pos;
  const el = Math.max(0, Date.now() + offset - pb.ts) / 1000;
  const p = pb.pos + el * (pb.rate || 1);
  const d = pb.track?.duration;
  return d ? Math.min(p, d) : p;
}

function applyPlayback(pb: Playback | null, syncVolume: boolean) {
  if (!pb?.track?.videoId) return;
  const stale = pb.playing && Date.now() + offset - pb.ts > 20_000;
  if (stale !== T().hostStale) {
    T().set({ hostStale: stale });
    log(stale ? 'Host tidak mengirim kabar > 20 dtk' : 'Host aktif lagi', stale ? 'warn' : 'info');
  }
  if (stale) return;
  const p = usePlayer.getState();
  const hold = T().localHold;
  const want = expectedPos(pb);
  const now = Date.now();

  // volume host
  if (syncVolume && pb.volume != null && Math.abs((p.muted ? 0 : p.volume) - pb.volume) > 0.02) p.setVolume(pb.volume);
  // kecepatan
  if ((pb.rate || 1) !== p.rate) p.setRate(pb.rate || 1);

  // lagu berbeda → muat lagu host di posisi yang sama
  if (p.current?.videoId !== pb.track.videoId) {
    if (lastLoad.vid === pb.track.videoId && now - lastLoad.at < 10_000) return;
    lastLoad = { vid: pb.track.videoId, at: now };
    loadFixed = false;
    fastUntil = now + 8000;
    log(`Memuat lagu host: ${pb.track.title} @${want.toFixed(1)}s`);
    p.syncTo(pb.track, want, pb.playing && !hold);
    return;
  }
  if (hold) return;
  const cur = engine.currentTime() || p.time;
  // lagu baru saja dimuat: begitu mulai berbunyi, lompat ke posisi host sekarang (menutup jeda waktu muat)
  if (now - lastLoad.at < 8000 && !loadFixed) {
    if (!p.playing || p.buffering) return;
    loadFixed = true;
    if (Math.abs(cur - want) > 0.4) { lastSeek = now; p.seek(want + SEEK_LEAD); log(`Menyamakan setelah muat → ${want.toFixed(1)}s`); }
    return;
  }

  if (pb.playing && !p.playing && !p.buffering) {
    if (now - lastPlayTry > 1500) {
      lastPlayTry = now;
      if (Math.abs(cur - want) > DRIFT_SEEK) p.seek(want + SEEK_LEAD);
      fastUntil = now + 4000;
      log('Host memutar → ikut memutar');
      void engine.play();
    }
    return;
  }
  if (!pb.playing && p.playing) {
    log('Host menjeda → ikut jeda');
    engine.pause();
    if (Math.abs(cur - pb.pos) > 0.5) p.seek(pb.pos);
    return;
  }
  if (p.buffering || now - lastSeek < 2500) return;
  const drift = cur - want;
  if (Math.abs(drift) > (pb.playing ? DRIFT_SEEK : 0.5)) {
    lastSeek = now;
    log(`Koreksi posisi ${drift > 0 ? '+' : ''}${drift.toFixed(1)}s → ${want.toFixed(1)}s`);
    p.seek(want + (pb.playing ? SEEK_LEAD : 0));
  }
}

async function guestPoll(myRun: number) {
  const s = T();
  if (s.role !== 'guest' || !s.session) return;
  try {
    const r = await api<{ status: string; hostName: string; playback: Playback | null; members: TogetherMember[]; settings: { syncVolume: boolean }; q?: SharedQ }>(
      'poll', { role: 'guest', code: s.code, memberId: s.session.memberId, key: s.session.key, qv: lastQv },
    );
    if (myRun !== alive) return;
    netOk();
    if (r.status === 'rejected') return endSession('Host menolak permintaan bergabung');
    if (r.status === 'kicked') return endSession('Kamu dikeluarkan dari sesi oleh host');
    if (r.status === 'pending') {
      T().set({ status: 'pending', hostName: r.hostName });
      return;
    }
    if (!wasApproved) {
      wasApproved = true;
      toast(`Terhubung — mendengarkan bersama ${r.hostName}`);
      log(`Disetujui. Terhubung ke ruangan ${s.code} (host: ${r.hostName})`);
    }
    T().set({ status: 'connected', hostName: r.hostName, members: r.members || [] });
    if (r.q) applyQ(r.q);
    const pbKey = r.playback ? `${r.playback.track?.videoId}|${r.playback.playing}|${r.playback.seq}` : '';
    if (pbKey !== lastPbKey) { lastPbKey = pbKey; fastUntil = Date.now() + 4000; }
    applyPlayback(r.playback, r.settings?.syncVolume !== false);
  } catch (e: any) {
    if (myRun !== alive) return;
    if (e?.data?.closed) return endSession('Host mengakhiri sesi');
    if (e?.data?.promoted) return promote(e.data);
    if (e?.data?.kicked || e?.status === 403) return endSession(e.message || 'Kamu sudah tidak ada di sesi ini');
    netFail(e, 'Polling tamu');
  }
}

interface SharedQ { v: string; queue: Track[]; history: Track[] }
function applyQ(q: SharedQ) {
  lastQv = q.v;
  T().set({ queue: q.queue || [], roomHistory: q.history || [] });
}

/** Host memindahkan peran host ke tamu ini → lanjutkan sebagai host dengan antrean bersama */
function promote(d: { hostKey: string; hostName: string; q?: SharedQ | null }) {
  const s = T();
  stopLoops();
  if (d.q) applyQ(d.q);
  const p = usePlayer.getState();
  const queue = T().queue;
  if (p.current && queue.length) usePlayer.setState({ queue: [p.current, ...queue.filter((x) => x.videoId !== p.current!.videoId)], index: 0 });
  wasApproved = false;
  T().set({
    role: 'host', status: 'connected', hostName: d.hostName, username: d.hostName, members: [], suggestions: [], localHold: false, hostStale: false, error: null,
    session: { role: 'host', code: s.code, key: d.hostKey, name: d.hostName, at: Date.now() },
  });
  log(`Peran host dipindahkan ke kamu (ruangan ${s.code})`);
  toast('Kamu sekarang host ruangan ini');
  startHostLoops();
}

/** Host menyerahkan peran host ke tamu yang online — ruangan tetap berjalan, host lama menjadi tamu */
export async function transferHost(m: TogetherMember) {
  const s = T();
  if (s.role !== 'host' || !s.session) return;
  try {
    const r = await api<{ memberId: string; memberKey: string; hostName: string }>('transfer', { code: s.code, key: s.session.key, memberId: m.id });
    stopLoops();
    T().set({
      role: 'guest', status: 'connected', hostName: r.hostName, members: [], suggestions: [], localHold: false, error: null,
      session: { role: 'guest', code: s.code, key: r.memberKey, memberId: r.memberId, name: s.session.name, at: Date.now() },
    });
    log(`Peran host diserahkan ke ${r.hostName}`);
    toast(`${r.hostName} sekarang host — kamu ikut mendengarkan sebagai tamu`);
    startGuestLoops();
  } catch (e: any) {
    toast(e.message);
    log(`Ganti host gagal: ${e.message}`, 'warn');
  }
}

/** Simpan daftar lagu ruangan menjadi playlist pribadi */
export function saveRoomPlaylist(tracks: Track[], code: string) {
  const uniq = tracks.filter((t, i) => tracks.findIndex((x) => x.videoId === t.videoId) === i);
  if (!uniq.length) return toast('Belum ada lagu di riwayat ruangan');
  const p = usePlayer.getState();
  const date = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  const id = p.createPlaylist(`Dengar bersama ${code} • ${date}`, `${uniq.length} lagu dari ruangan ${code}`);
  for (const t of uniq) usePlayer.getState().addToPlaylist(id, t);
  toast(`Playlist dibuat • ${uniq.length} lagu`);
  return id;
}

function startGuestLoops() {
  stopLoops();
  const myRun = alive;
  lastQv = '';
  lastLoad = { vid: '', at: 0 };
  lastSeek = 0;
  wasApproved = false;
  fastUntil = Date.now() + 4000;
  const loop = async () => {
    if (myRun !== alive) return;
    await guestPoll(myRun);
    if (myRun !== alive) return;
    window.setTimeout(loop, Date.now() < fastUntil ? GUEST_POLL_FAST : GUEST_POLL);
  };
  void loop();
}

export async function suggestTrack(t: Track) {
  const s = T();
  if (s.role !== 'guest' || !s.session) return;
  if (s.status !== 'connected') return toast('Tunggu host menyetujui permintaan bergabung dulu');
  try {
    await api('suggest', { code: s.code, memberId: s.session.memberId, key: s.session.key, track: slim(t) });
    toast(`Disarankan ke ${s.hostName || 'host'}: ${t.title}`);
    log(`Menyarankan lagu: ${t.title}`);
  } catch (e: any) {
    toast(e.message);
    log(`Saran gagal: ${e.message}`, 'warn');
  }
}
togetherHooks.suggest = (t) => void suggestTrack(t);
togetherHooks.toggle = () => guestToggle();

/** Tamu menekan putar/jeda sendiri */
export function guestToggle() {
  const p = usePlayer.getState();
  if (p.playing) {
    T().set({ localHold: true });
    engine.pause();
    toast('Dijeda di perangkat ini — ketuk ▶ untuk ikut host lagi');
  } else {
    T().set({ localHold: false });
    lastPlayTry = 0;
    lastLoad.at = 0;
    void engine.play();
  }
}

/* ───────────────────────────── sesi ───────────────────────────── */

/**
 * Kode kosong → buat ruangan (name = username host baru).
 * Kode terisi → bergabung; name = username host (harus cocok dengan kode), me = nama tamu yang dilihat host.
 */
export async function connect(name: string, code: string, me = '') {
  const s = T();
  if (s.status === 'connecting') return;
  const username = name.trim();
  const room = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (username.length < 2) {
    T().set({ error: room ? 'Isi username host minimal 2 karakter' : 'Isi username minimal 2 karakter' });
    return;
  }
  T().set({ status: 'connecting', error: null, retry: { name: username, code: room, me } });
  log(`Menghubungkan ke ${serverBase()} …`);
  try {
    if (!room) {
      const r = await withRetry(() => api<{ code: string; hostKey: string; hostName: string }>('create', {
        name: username, dev: s.deviceId, settings: { autoJoin: s.autoApproveJoin, autoSuggest: s.autoApproveSuggest, syncVolume: s.syncVolume },
      }));
      T().set({
        username, error: null,
        status: 'connected', role: 'host', code: r.code, hostName: r.hostName, members: [], suggestions: [], queue: [], roomHistory: [], localHold: false,
        session: { role: 'host', code: r.code, key: r.hostKey, name: username, at: Date.now() },
      });
      log(`Ruangan dibuat: ${r.code}`);
      toast(`Ruangan ${r.code} dibuat — bagikan kodenya ke teman`);
      startHostLoops();
    } else {
      const guest = me.trim().length >= 2 ? me.trim() : `Tamu ${s.deviceId.slice(0, 4).toUpperCase()}`;
      const r = await withRetry(() => api<{ memberId: string; memberKey: string; status: string; hostName: string; code: string }>('join', { code: room, hostName: username, name: guest, dev: s.deviceId }));
      T().set({
        error: null,
        status: r.status === 'approved' ? 'connected' : 'pending', role: 'guest', code: r.code, hostName: r.hostName, members: [], suggestions: [], queue: [], roomHistory: [], localHold: false,
        session: { role: 'guest', code: r.code, key: r.memberKey, memberId: r.memberId, name: guest, at: Date.now() },
      });
      log(r.status === 'approved' ? `Bergabung ke ${r.code}` : `Menunggu persetujuan ${r.hostName}…`);
      startGuestLoops();
    }
  } catch (e: any) {
    log(`Gagal terhubung: ${e.message}`, 'error');
    T().set({ status: 'error', error: e.message, role: null });
  }
}

/** Reconnect: di dalam sesi → mulai ulang koneksi ke ruangan; gagal sebelum masuk → ulangi percobaan terakhir */
export function reconnect() {
  const s = T();
  if (s.status === 'connecting') return;
  if (s.role && s.session) {
    log(`Reconnect ke ruangan ${s.code}…`);
    T().set({ error: 'Menghubungkan ulang…' });
    if (s.role === 'host') startHostLoops();
    else startGuestLoops();
    return;
  }
  if (s.retry) void connect(s.retry.name, s.retry.code, s.retry.me);
}

/**
 * Tamu berhenti mengikuti host → hentikan musik di perangkat tamu saja.
 * Musik host tidak pernah disentuh (host tetap memutar walau tamu keluar).
 */
function stopGuestMusic(role: TogetherRole) {
  if (role !== 'guest' || !wasApproved) return false;
  wasApproved = false;
  T().set({ localHold: false });
  engine.pause();
  log('Musik dari host dihentikan di perangkat ini');
  return true;
}

function endSession(msg: string) {
  const role = T().role;
  stopLoops();
  const stopped = stopGuestMusic(role);
  log(msg, 'warn');
  toast(stopped ? `${msg} — musik dihentikan` : msg);
  resetState();
}

/** Putuskan: host mengakhiri ruangan untuk semua orang, tamu keluar dari ruangan */
export async function disconnect(silent = false) {
  const s = T();
  const sess = s.session;
  stopLoops();
  // tamu keluar → musik di HP tamu ikut berhenti; host mengakhiri ruangan → musik host tetap jalan
  const stopped = stopGuestMusic(s.role);
  if (!silent) {
    if (stopped) toast('Kamu keluar dari sesi — musik dihentikan');
    else if (s.role === 'host') toast('Ruangan diakhiri — musikmu tetap diputar');
  }
  resetState();
  if (!sess) return;
  try {
    if (sess.role === 'host') await api('close', { code: sess.code, key: sess.key }, 5000);
    else await api('leave', { code: sess.code, memberId: sess.memberId, key: sess.key }, 5000);
    log(sess.role === 'host' ? `Ruangan ${sess.code} diakhiri` : `Keluar dari ruangan ${sess.code}`);
  } catch (e: any) {
    log(`Putuskan: ${e.message}`, 'warn');
  }
}

/** Lanjutkan sesi setelah aplikasi dibuka ulang / dimuat ulang */
export function resumeTogether() {
  const s = T();
  const sess = s.session;
  if (!sess || s.role) return;
  if (Date.now() - sess.at > SESSION_MAX_AGE) {
    T().set({ session: null });
    return;
  }
  log(`Melanjutkan sesi ${sess.code} sebagai ${sess.role}`);
  T().set({ status: sess.role === 'host' ? 'connected' : 'pending', role: sess.role, code: sess.code, hostName: sess.role === 'host' ? sess.name : '' });
  if (sess.role === 'host') startHostLoops();
  else startGuestLoops();
}

/** Ambil username host & kode sesi dari pesan undangan (tautan ?code=&host= atau teks "Username host: … • Kode sesi: …") */
export function parseInvite(text: string): { host: string; code: string } {
  let host = '';
  let code = '';
  const url = text.match(/https?:\/\/\S+/)?.[0];
  if (url) {
    try {
      const u = new URL(url);
      code = u.searchParams.get('code') || '';
      host = u.searchParams.get('host') || '';
    } catch { /* bukan URL valid */ }
  }
  if (!host) host = text.match(/username host\s*:\s*(.+?)(?:\s*[•|\n]|\s+kode sesi|$)/i)?.[1] || '';
  if (!code) code = text.match(/kode(?: sesi)?\s*:\s*([A-Za-z0-9]{4,8})/i)?.[1] || '';
  if (!code && /^\s*[A-Za-z0-9]{6}\s*$/.test(text)) code = text;
  return { host: host.trim().slice(0, 24), code: code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) };
}

/** Teks undangan + tautan yang langsung mengisi kode sesi */
export function inviteLink(code: string, host = '') {
  const u = new URL('/together', location.origin);
  u.searchParams.set('code', code);
  if (host) u.searchParams.set('host', host);
  return u.toString();
}
