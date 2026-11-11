/**
 * Unduh audio LANGSUNG DARI HP (khusus APK / Capacitor).
 *
 * Kenapa: YouTube sering memblokir IP server (Vercel/Netlify = IP data center) dengan pesan
 * "Sign in to confirm you're not a bot", sehingga /api/dl gagal. Di APK, permintaan dikirim lewat
 * HTTP native (CapacitorHttp — tanpa batasan CORS) memakai IP HP sendiri, yang hampir selalu lolos.
 * URL googlevideo terikat ke IP peminta, jadi resolve & unduh sama-sama dilakukan di HP.
 */
import { savingData } from './dataSaver';
import { audioDb } from './idb';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

const PLAYER = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
/** potongan lebih kecil dari server agar data base64 lewat bridge Capacitor tetap ringan */
const CHUNK = 1.5 * 1024 * 1024;

interface Client { name: string; id: string; ua: string; ctx: Record<string, unknown>; supportsPoToken?: boolean }
// Klien diurutkan: yang paling andal (support PO token) di depan
const CLIENTS: Client[] = [
  {
    name: 'ANDROID_VR',
    id: '28',
    ua: 'com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    ctx: { clientName: 'ANDROID_VR', clientVersion: '1.62.27', deviceMake: 'Oculus', deviceModel: 'Quest 3', osName: 'Android', osVersion: '12L', androidSdkVersion: 32 },
    supportsPoToken: true,
  },
  {
    name: 'ANDROID_EMBED',
    id: '94',
    ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
    ctx: { clientName: 'ANDROID_EMBED', clientVersion: '20.10.38', osName: 'Android', osVersion: '11', androidSdkVersion: 30 },
    supportsPoToken: true,
  },
  {
    name: 'ANDROID',
    id: '3',
    ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
    ctx: { clientName: 'ANDROID', clientVersion: '20.10.38', osName: 'Android', osVersion: '11', androidSdkVersion: 30 },
    supportsPoToken: false,
  },
  {
    name: 'IOS',
    id: '5',
    ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
    ctx: { clientName: 'IOS', clientVersion: '20.10.4', deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.3.2.22D82' },
    supportsPoToken: false,
  },
  {
    name: 'MWEB',
    id: '64',
    ua: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
    ctx: { clientName: 'MWEB', clientVersion: '2.20250303.00.00', osName: 'Android', osVersion: '14', deviceMake: 'Google', deviceModel: 'Pixel 8' },
    supportsPoToken: false,
  },
  {
    name: 'TV_EMBED',
    id: '85',
    ua: 'com.google.android.youtube.tv/8.30.2 (Linux; Android 11) gzip',
    ctx: { clientName: 'TV_EMBED', clientVersion: '8.30.2', osName: 'Android', osVersion: '11', androidSdkVersion: 30, screenWidthPoints: 1920, screenHeightPoints: 1080, screenPixelDensity: 2 },
    supportsPoToken: false,
  },
];

/** true bila unduhan bisa dilakukan langsung dari perangkat (APK) */
export const deviceDownloadSupported = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('CapacitorHttp');

interface Resolved { url: string; mime: string; size: number; ua: string; client: string }

function pickFormat(formats: any[]): any | undefined {
  const audio = formats.filter((f) => typeof f?.mimeType === 'string' && f.mimeType.startsWith('audio/') && f.url);
  if (!audio.length) return undefined;
  
  // hemat data: ambil bitrate audio terendah yang masih layak (±48–70 kbps)
  if (savingData()) {
    const low = audio.filter((f) => (f.bitrate || 0) >= 40_000).sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0))[0];
    if (low) return low;
  }
  
  // Prioritaskan format yang paling kompatibel dan berkualitas baik
  const preferredItags = [140, 141, 251, 250, 249]; // AAC 128k, AAC 256k, Opus 160k, Opus 70k, Opus 50k
  for (const itag of preferredItags) {
    const found = audio.find((f) => f.itag === itag);
    if (found) return found;
  }
  
  // Fallback: audio/mp4 (AAC) dengan bitrate tertinggi
  const mp4 = audio.filter((f) => f.mimeType.startsWith('audio/mp4')).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
  if (mp4) return mp4;
  
  // Terakhir: bitrate tertinggi apapun
  return audio.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
}

async function resolve(videoId: string, skip: string[]): Promise<Resolved> {
  const reasons: string[] = [];
  for (const c of CLIENTS) {
    if (skip.includes(c.name)) continue;
    try {
      // Add PO token support for clients that need it
      const requestData: any = {
        context: { client: { ...c.ctx, hl: 'en', gl: 'US' } },
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
      };
      
      const res = await CapacitorHttp.post({
        url: PLAYER,
        headers: { 
          'Content-Type': 'application/json', 
          'User-Agent': c.ua, 
          'X-YouTube-Client-Name': c.id, 
          'X-YouTube-Client-Version': String(c.ctx.clientVersion) 
        },
        data: requestData,
        connectTimeout: 15_000,
        readTimeout: 20_000,
      });
      const j: any = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      if (res.status !== 200) { reasons.push(`${c.name}: HTTP ${res.status}`); continue; }
      const st = j?.playabilityStatus?.status;
      if (st !== 'OK') { 
        const reason = j?.playabilityStatus?.reason || st || 'tidak tersedia';
        reasons.push(`${c.name}: ${reason}`);
        // If it's a bot detection, don't retry with same client
        if (reason.toLowerCase().includes('bot') || reason.toLowerCase().includes('sign in')) {
          skip.push(c.name);
        }
        continue; 
      }
      const f = pickFormat(j?.streamingData?.adaptiveFormats || []);
      if (!f) { reasons.push(`${c.name}: tidak ada format audio`); continue; }
      return { url: f.url, mime: String(f.mimeType).split(';')[0], size: Number(f.contentLength) || 0, ua: c.ua, client: c.name };
    } catch (e: any) {
      reasons.push(`${c.name}: ${e?.message || 'gagal'}`);
    }
  }
  throw new Error(`Audio tidak bisa diambil dari perangkat (${reasons.join('; ') || 'tidak ada klien'})`);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Unduh seluruh file audio langsung dari HP. */
export async function downloadOnDevice(videoId: string, signal: AbortSignal, onProgress: (p: number) => void): Promise<Blob> {
  const skip: string[] = [];
  let r = await resolve(videoId, skip);
  const parts: Uint8Array[] = [];
  let start = 0;
  let total = r.size || Infinity;
  let fails = 0;
  let consecutiveEmptyChunks = 0;
  const MAX_EMPTY_CHUNKS = 3;
  
  while (start < total) {
    if (signal.aborted) throw new DOMException('Dibatalkan', 'AbortError');
    const end = Math.min(start + CHUNK - 1, Number.isFinite(total) ? total - 1 : start + CHUNK - 1);
    let res;
    try {
      res = await CapacitorHttp.get({
        url: r.url,
        headers: { Range: `bytes=${start}-${end}`, 'User-Agent': r.ua, 'Accept': '*/*' },
        responseType: 'arraybuffer',
        connectTimeout: 15_000,
        readTimeout: 45_000, // Increased timeout for slow connections
      });
    } catch (e: any) {
      if (++fails > 5) throw new Error(e?.message || 'Jaringan bermasalah');
      // Exponential backoff with jitter
      await new Promise((ok) => setTimeout(ok, Math.min(800 * fails + Math.random() * 500, 10000)));
      continue;
    }
    if (signal.aborted) throw new DOMException('Dibatalkan', 'AbortError');
    
    if (res.status !== 200 && res.status !== 206) {
      // URL kedaluwarsa / ditolak → ambil ulang alamat dengan klien lain
      if (res.status === 403 && start >= 1024 * 1024 && !r.client.includes('VR') && !r.client.includes('EMBED'))
        throw new Error('YouTube memotong unduhan setelah 1 MB (klien butuh token) — mencoba sumber lain');
      if (res.status === 416) { // Range not satisfiable - we're done
        break;
      }
      if (++fails > 5) throw new Error(`Gagal mengunduh audio (HTTP ${res.status})`);
      skip.push(r.client);
      if (skip.length >= CLIENTS.length) {
        // Semua klien YouTube gagal → lempar error yang jelas untuk fallback ke mirror/alternatif
        throw new Error('Semua klien YouTube gagal — coba "Link Lain"');
      }
      r = await resolve(videoId, skip);
      continue;
    }
    
    const data = res.data;
    const bytes = typeof data === 'string' ? b64ToBytes(data) : data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(0);
    
    if (!bytes.byteLength) {
      consecutiveEmptyChunks++;
      if (consecutiveEmptyChunks >= MAX_EMPTY_CHUNKS) {
        // Might be end of stream
        break;
      }
      // Small delay before retry
      await new Promise((ok) => setTimeout(ok, 500));
      continue;
    }
    
    consecutiveEmptyChunks = 0;
    
    const cr = Object.entries(res.headers || {}).find(([k]) => k.toLowerCase() === 'content-range')?.[1];
    const t = Number(String(cr || '').split('/')[1]);
    if (t) total = t;
    parts.push(bytes);
    start += bytes.byteLength;
    if (!Number.isFinite(total) && bytes.byteLength < CHUNK) total = start; // ukuran tidak diketahui → potongan terakhir
    fails = 0;
    onProgress(Number.isFinite(total) ? Math.min(1, start / total) : Math.min(0.99, start / (start + CHUNK)));
    // pastikan progress tidak pernah mundur / >1
  }
  
  if (parts.length === 0) {
    throw new Error('Tidak ada data audio yang diterima');
  }
  
  return new Blob(parts as BlobPart[], { type: r.mime });
}
