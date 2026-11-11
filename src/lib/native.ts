import { Capacitor } from '@capacitor/core';

/** true bila berjalan di dalam APK (Capacitor) */
export const isNativeApp = () => Capacitor.isNativePlatform();
