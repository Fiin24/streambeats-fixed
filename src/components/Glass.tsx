import { useEffect } from 'react';
import { useSettings } from '../store/settings';

/** Lapisan kaca — taruh sebagai anak pertama elemen ber-class `lg` + `rounded-*` */
export function GlassLayers() {
  return (
    <span className="lg-clip" aria-hidden="true">
      <span className="lg-fx" />
      <span className="lg-tint" />
      <span className="lg-shine" />
    </span>
  );
}

/** Filter SVG untuk distorsi kaca cair + kelas <html> sesuai kemampuan browser & pengaturan */
export function GlassDefs() {
  const glass = useSettings((s) => s.glass);
  useEffect(() => {
    const html = document.documentElement;
    // backdrop-filter + filter: url() hanya mulus di Chromium (Chrome, Edge, Opera, Android)
    const chromium = !!(navigator as any).userAgentData?.brands?.some((b: { brand: string }) => /Chromium/i.test(b.brand));
    html.classList.toggle('lg-svg', glass && chromium);
    html.classList.toggle('no-glass', !glass);
  }, [glass]);
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <filter id="lg-distort" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.006 0.012" numOctaves="2" seed="7" result="noise" />
        <feGaussianBlur in="noise" stdDeviation="2.5" result="soft" />
        <feDisplacementMap in="SourceGraphic" in2="soft" scale="38" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
