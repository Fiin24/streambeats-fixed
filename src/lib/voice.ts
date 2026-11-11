/** Pencarian suara: APK → intent pengenalan suara Android (plugin VoiceSearch); browser → Web Speech API */
import { Capacitor, registerPlugin } from '@capacitor/core';

interface VoiceSearchPlugin { available(): Promise<{ available: boolean }>; listen(o: { prompt?: string; lang?: string }): Promise<{ text: string }> }
const VoiceSearch = registerPlugin<VoiceSearchPlugin>('VoiceSearch');
const native = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('VoiceSearch');
const WebSR = () => (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export async function voiceAvailable(): Promise<boolean> {
  if (native()) return VoiceSearch.available().then((r) => r.available).catch(() => false);
  return !!WebSR();
}

/** Mengembalikan teks yang diucapkan, atau '' bila dibatalkan */
export function listen(lang = 'id-ID'): Promise<string> {
  if (native()) return VoiceSearch.listen({ prompt: 'Sebutkan judul lagu atau artis', lang }).then((r) => r.text || '');
  const SR = WebSR();
  if (!SR) return Promise.reject(new Error('Pencarian suara tidak didukung di perangkat ini'));
  return new Promise((resolve, reject) => {
    const r = new SR();
    r.lang = lang;
    r.interimResults = false;
    r.maxAlternatives = 1;
    let done = false;
    r.onresult = (e: any) => { done = true; resolve(e.results?.[0]?.[0]?.transcript || ''); };
    r.onerror = (e: any) => { done = true; e.error === 'no-speech' || e.error === 'aborted' ? resolve('') : reject(new Error(e.error === 'not-allowed' ? 'Izin mikrofon ditolak' : 'Pencarian suara gagal')); };
    r.onend = () => { if (!done) resolve(''); };
    r.start();
  });
}
