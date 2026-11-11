/** Sembunyikan layar pembuka (index.html #splash) dengan animasi memudar */
const MIN_MS = 1500; // biar animasinya sempat terlihat, tapi tidak memperlambat
let done = false;

export function hideSplash() {
  if (done) return;
  done = true;
  const el = document.getElementById('splash');
  if (!el) return;
  const elapsed = performance.now();
  const wait = Math.max(0, MIN_MS - elapsed);
  window.setTimeout(() => {
    requestAnimationFrame(() => {
      el.classList.add('sb-hide');
      window.setTimeout(() => el.remove(), 600);
    });
  }, wait);
}
