/**
 * Smooth Scrolling mit Lenis, getaktet über den GSAP-Ticker, damit
 * ScrollTrigger und Lenis im selben Frame rechnen.
 * Bei "Bewegung reduzieren" wird Lenis gar nicht erst gestartet (native Scroll).
 */
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { $ } from './utils.js';

export function createSmoothScroll({ reduced }) {
  let lenis = null;
  if (!reduced) {
    lenis = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop(); // läuft erst nach dem Preloader
  }

  /** Scrollt zu einem Selektor, Element oder 0 (= Seitenanfang). */
  function scrollTo(target, { onComplete } = {}) {
    const el = typeof target === 'string' ? $(target) : target;
    if (lenis) {
      // Lenis zieht scroll-padding-top (für Tastaturfokus gesetzt) ab – bei Anker-Sprüngen
      // wieder ausgleichen, damit Sektionen wie gestaltet bündig oben landen.
      const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      lenis.scrollTo(el ?? 0, { duration: 1.6, offset: el ? pad : 0, onComplete });
      return;
    }
    if (el) el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    else window.scrollTo({ top: 0 });
    onComplete?.();
  }

  return { lenis, scrollTo };
}
