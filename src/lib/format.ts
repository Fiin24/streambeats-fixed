export function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h >= 4 && h < 11) return 'Selamat Pagi';
  if (h >= 11 && h < 15) return 'Selamat Siang';
  if (h >= 15 && h < 18) return 'Selamat Sore';
  return 'Selamat Malam';
}
export const artistNames = (t: { artists?: { name: string }[]; subtitle?: string }) =>
  t.artists?.length ? t.artists.map((a) => a.name).join(', ') : t.subtitle || '';
export const uid = () => Math.random().toString(36).slice(2, 10);
