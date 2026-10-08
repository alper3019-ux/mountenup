/**
 * Preloader: zählt 000 → 100 und wischt dann nach oben weg.
 * Er wartet auf: Schriften + kurze Mindestdauer + (3D-Szene ODER Zeitlimit).
 * Das Zeitlimit sorgt dafür, dass Inhalte auf langsamen Geräten nicht
 * unnötig lange verdeckt bleiben – die 3D-Szene blendet sich dann nachträglich ein.
 */
import { gsap } from 'gsap';
import { $, wait } from './utils.js';

const MIN_DURATION = 600;   // ms – genug für eine ruhige Zählanimation
const SCENE_TIMEOUT = 2500; // ms – länger wird nicht auf WebGL gewartet

export function runPreloader({ reduced, sceneReady }) {
  const progress = { v: 0 };
  const num = $('.preloader__num');
  const bar = $('.preloader__bar span');
  const render = () => {
    num.textContent = String(Math.round(progress.v)).padStart(3, '0');
    bar.style.transform = `scaleX(${progress.v / 100})`;
  };

  const loading = gsap.to(progress, { v: 82, duration: reduced ? 0.2 : 1.4, ease: 'power2.out', onUpdate: render });
  const fontsReady = (document.fonts?.ready ?? Promise.resolve()).catch(() => {});

  return Promise.all([
    fontsReady,
    wait(reduced ? 150 : MIN_DURATION),
    Promise.race([sceneReady, wait(SCENE_TIMEOUT)]),
  ]).then(() => new Promise((resolve) => {
    loading.kill();
    gsap.to(progress, { v: 100, duration: reduced ? 0.1 : 0.45, ease: 'power3.inOut', onUpdate: render, onComplete: resolve });
  }));
}

/** Blendet den Preloader aus; `onReveal` startet die Hero-Animation überlappend. */
export function exitPreloader({ reduced, onReveal, onDone }) {
  const el = $('.preloader');
  const tl = gsap.timeline({
    onComplete: () => {
      el.remove();
      document.body.classList.remove('is-loading');
      onDone?.();
    },
  });
  if (reduced) {
    tl.to(el, { autoAlpha: 0, duration: 0.3 });
    onReveal();
    return tl;
  }
  tl.to('.preloader__inner > *', { yPercent: -40, autoAlpha: 0, stagger: 0.05, duration: 0.5, ease: 'power3.in' })
    .to(el, { clipPath: 'inset(0 0 100% 0)', duration: 0.95, ease: 'expo.inOut' }, '-=0.15')
    .add(onReveal, '-=0.6');
  return tl;
}
