import { savingData } from './dataSaver';

/** Ubah ukuran thumbnail Google/YouTube agar tajam di ukuran tampilan */
export function img(url?: string, size = 544): string {
  if (!url) return '';
  if (savingData()) size = Math.min(size, 240);
  if (/googleusercontent\.com|ggpht\.com/.test(url)) {
    if (/=w\d+-h\d+/.test(url)) return url.replace(/=w\d+-h\d+/, `=w${size}-h${size}`);
    if (/=s\d+/.test(url)) return url.replace(/=s\d+/, `=s${size}`);
    return url;
  }
  return url;
}
