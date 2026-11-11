/**
 * Equalizer & normalisasi volume (Web Audio).
 * Hanya bisa diterapkan pada lagu yang diputar dari file unduhan (<audio> lokal): audio streaming
 * berjalan di dalam iframe YouTube lintas-domain yang tidak bisa disadap oleh browser/WebView.
 * Graf Web Audio baru dibuat saat EQ/normalisasi pertama kali dinyalakan agar pemutaran biasa tidak terpengaruh.
 */
import { useSettings } from '../store/settings';

export const EQ_BANDS = [60, 230, 910, 3600, 14000];
export const EQ_LABELS = ['60', '230', '910', '3,6k', '14k'];

export const EQ_PRESETS: { id: string; name: string; gains: number[] }[] = [
  { id: 'flat', name: 'Datar', gains: [0, 0, 0, 0, 0] },
  { id: 'bass', name: 'Bass Boost', gains: [7, 4, 0, -1, 0] },
  { id: 'vocal', name: 'Vokal', gains: [-2, -1, 3, 4, 1] },
  { id: 'treble', name: 'Treble', gains: [0, 0, 0, 3, 6] },
  { id: 'acoustic', name: 'Akustik', gains: [3, 1, 1, 2, 3] },
  { id: 'night', name: 'Malam', gains: [-3, -1, 1, 1, -4] },
];

let ctx: AudioContext | null = null;
let filters: BiquadFilterNode[] = [];
let comp: DynamicsCompressorNode | null = null;
let makeup: GainNode | null = null;
let el: HTMLAudioElement | null = null;

const wanted = () => {
  const s = useSettings.getState();
  return (s.eqOn && s.eqGains.some((g) => g !== 0)) || s.normalize;
};

function build(audio: HTMLAudioElement) {
  const AC: typeof AudioContext | undefined = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  const src = ctx.createMediaElementSource(audio);
  filters = EQ_BANDS.map((f, i) => {
    const b = ctx!.createBiquadFilter();
    b.type = i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking';
    b.frequency.value = f;
    b.Q.value = 1.1;
    return b;
  });
  comp = ctx.createDynamicsCompressor();
  makeup = ctx.createGain();
  let node: AudioNode = src;
  for (const f of filters) { node.connect(f); node = f; }
  node.connect(comp);
  comp.connect(makeup);
  makeup.connect(ctx.destination);
  el = audio;
  // WebView/Chrome membuat AudioContext dalam keadaan "suspended" bila dibuat di luar ketukan pengguna
  const resume = () => { if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => undefined); };
  audio.addEventListener('play', resume);
  audio.addEventListener('playing', resume);
  document.addEventListener('pointerdown', resume, { passive: true });
}

function apply() {
  if (!ctx || !comp || !makeup) return;
  const s = useSettings.getState();
  const t = ctx.currentTime;
  filters.forEach((f, i) => f.gain.setTargetAtTime(s.eqOn ? s.eqGains[i] || 0 : 0, t, 0.05));
  // normalisasi: kompresor lembut + penguatan kecil agar lagu pelan & keras terdengar setara
  comp.threshold.setTargetAtTime(s.normalize ? -26 : 0, t, 0.05);
  comp.ratio.setTargetAtTime(s.normalize ? 4 : 1, t, 0.05);
  comp.knee.setTargetAtTime(s.normalize ? 12 : 0, t, 0.05);
  comp.attack.value = 0.01;
  comp.release.value = 0.3;
  // cegah clipping bila pita dinaikkan banyak
  const boost = s.eqOn ? Math.max(0, ...s.eqGains) : 0;
  makeup.gain.setTargetAtTime((s.normalize ? 1.6 : 1) * Math.pow(10, -boost / 2 / 20), t, 0.05);
}

/** Dipanggil engine saat memutar file lokal */
export function attachFx(audio: HTMLAudioElement) {
  if (!ctx && wanted()) {
    try { build(audio); } catch (e) { console.warn('[fx] Web Audio tidak tersedia', e); return; }
  }
  if (ctx && el === audio) {
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    apply();
  }
}

let lastAudio: HTMLAudioElement | null = null;
const fxListeners: (() => void)[] = [];
export const onFxChange = (f: () => void) => { fxListeners.push(f); };
export function registerFxTarget(audio: HTMLAudioElement) { lastAudio = audio; }
/** true bila EQ/normalisasi aktif → pemutar mengambil audio sendiri agar bisa diolah */
export const fxWanted = wanted;

useSettings.subscribe((s, p) => {
  if (s.eqOn === p.eqOn && s.eqGains === p.eqGains && s.normalize === p.normalize) return;
  if (ctx) apply();
  else if (lastAudio && wanted() && lastAudio.src) attachFx(lastAudio);
  fxListeners.forEach((f) => f());
});
