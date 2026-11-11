/**
 * Simpan file ke penyimpanan HP (khusus APK). Memakai plugin native "FileSaver"
 * (android/app/src/main/java/.../FileSaverPlugin.java) → Music/Stream Beats lewat MediaStore,
 * sehingga lagu langsung muncul di aplikasi pemutar musik lain.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

interface FileSaverPlugin {
  open(o: { name: string; mime: string }): Promise<{ id: string }>;
  write(o: { id: string; data: string }): Promise<void>;
  close(o: { id: string }): Promise<{ location: string }>;
  abort(o: { id: string }): Promise<void>;
}

const FileSaver = registerPlugin<FileSaverPlugin>('FileSaver');

export const nativeSaveAvailable = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('FileSaver');

const PIECE = 512 * 1024; // kelipatan 3 tidak wajib karena tiap potongan di-encode terpisah

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Tulis blob ke perangkat per potongan; mengembalikan lokasi yang mudah dibaca */
export async function saveBlobNative(blob: Blob, name: string): Promise<string> {
  const { id } = await FileSaver.open({ name, mime: blob.type || 'audio/mp4' });
  try {
    const buf = new Uint8Array(await blob.arrayBuffer());
    for (let i = 0; i < buf.length; i += PIECE) await FileSaver.write({ id, data: toBase64(buf.subarray(i, i + PIECE)) });
    const { location } = await FileSaver.close({ id });
    return location || 'Music/Stream Beats';
  } catch (e) {
    await FileSaver.abort({ id }).catch(() => undefined);
    throw e;
  }
}
