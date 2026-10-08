/**
 * Alle GSAP-Animationen der Startseite: Hero-Intro, Text-Reveals,
 * Scroll-Szenen (ScrollTrigger) und Zähler.
 *
 * Barrierefreiheit: SplitText zerlegt Texte in viele <span>/<div>.
 * Für Hero-Headline und Statement nutzen wir `aria: 'none'` – das sichtbare,
 * zerlegte Element ist im HTML bereits aria-hidden, und eine
 * .visually-hidden-Kopie liefert Screenreadern den Satz am Stück
 * (Empfehlung aus der GSAP-SplitText-Doku für verschachtelte Elemente).
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { $, $$ } from './utils.js';

gsap.registerPlugin(ScrollTrigger, SplitText);

let heroChars = [];

/** Hero-Headline zeichenweise einblenden (nach dem Preloader). */
export function heroIntro({ reduced }) {
  if (reduced) {
    gsap.set(['.reveal-fade', heroChars], { autoAlpha: 1, clearProps: 'filter' });
    return;
  }
  gsap.timeline()
    .fromTo(heroChars,
      { autoAlpha: 0, yPercent: 60, filter: 'blur(14px)' },
      { autoAlpha: 1, yPercent: 0, filter: 'blur(0px)', duration: 1.3, ease: 'expo.out', stagger: { each: 0.035, from: 'start' },
        onComplete: () => gsap.set(heroChars, { clearProps: 'filter,willChange' }) }, 0.1)
    // opacity statt autoAlpha: Links/Buttons bleiben während der Einblendung per Tastatur erreichbar
    .fromTo('.hero .reveal-fade', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.1 }, 0.35)
    .fromTo('.nav > *', { opacity: 0, y: -16 }, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', stagger: 0.06 }, 0.4);
}

/** Wird einmal nach dem Preloader aufgerufen. `getScene()` liefert die 3D-Szene oder null. */
export function setupAnimations({ reduced, getScene }) {
  // Hero-Headline in Zeichen zerlegen (Startzustand: unsichtbar)
  $$('.hero__title [data-split="chars"]').forEach((el) => {
    const split = new SplitText(el, { type: 'chars,words', charsClass: 'char', aria: 'none' });
    heroChars.push(...split.chars);
  });
  gsap.set(heroChars, { autoAlpha: 0, willChange: 'transform, opacity, filter' });

  if (reduced) {
    gsap.set('.reveal-up, .reveal-fade', { autoAlpha: 1 });
    setupCounters({ reduced });
    getScene()?.measure();
    return;
  }

  // Abschnittstitel: maskierte Zeilen-Reveals (autoSplit teilt bei Resize neu)
  $$('[data-split="lines"]').forEach((el) => {
    SplitText.create(el, {
      type: 'lines', mask: 'lines', linesClass: 'split-line-inner', autoSplit: true,
      onSplit: (self) => gsap.from(self.lines, {
        yPercent: 110, rotate: 2, duration: 1.3, ease: 'expo.out', stagger: 0.1,
        scrollTrigger: { trigger: el, start: 'top 85%', once: true },
      }),
    });
  });

  // Fade-up-Reveals in Gruppen
  ScrollTrigger.batch('main .reveal-up', {
    start: 'top 88%', once: true,
    onEnter: (els) => gsap.fromTo(els, { autoAlpha: 0, y: 50 }, { autoAlpha: 1, y: 0, duration: 1.2, ease: 'expo.out', stagger: 0.09, overwrite: true }),
  });

  // Prozess: Linie zeichnet sich
  gsap.to('.process__line span', {
    scaleX: 1, ease: 'none',
    scrollTrigger: { trigger: '.process__steps', start: 'top 75%', end: 'bottom 60%', scrub: 0.8 },
  });

  // Hero-Foto: Tiefen-Parallaxe (Foto langsamer als Text, leichter Zoom)
  gsap.fromTo('.hero__photo picture', { yPercent: 0, scale: 1.04 }, {
    yPercent: 18, scale: 1.12, ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  });

  // Fotos: Bild bewegt sich innerhalb seines Rahmens (Parallaxe ohne Layout-Verschiebung)
  $$('.tour__photo, .band__figure, .g').forEach((fig) => {
    const pic = $('picture', fig);
    if (!pic) return;
    fig.classList.add('is-parallax');
    gsap.fromTo($('img', pic), { yPercent: -6 }, {
      yPercent: 6, ease: 'none',
      scrollTrigger: { trigger: fig, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });

  // Hero-Headline driftet beim Scrollen nach oben weg
  gsap.to('.hero__title', {
    yPercent: -18, autoAlpha: 0.15, ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  });

  // Footer-Wortmarke wächst herein
  gsap.fromTo('.footer__word', { yPercent: 35, scaleY: 1.25, transformOrigin: '50% 100%' }, {
    yPercent: 0, scaleY: 1, ease: 'none',
    scrollTrigger: { trigger: '.footer', start: 'top bottom', end: 'bottom bottom', scrub: true },
  });

  setupCounters({ reduced });
  ScrollTrigger.addEventListener('refresh', () => getScene()?.measure());
  ScrollTrigger.refresh();
}

/** Zähler: Endwerte stehen im HTML (ohne JS korrekt), JS zählt beim Erscheinen hoch. */
function setupCounters({ reduced }) {
  if (reduced) return;
  $$('[data-count]').forEach((el) => {
    const end = Number(el.dataset.count);
    const suffix = el.dataset.suffix || '';
    const o = { v: 0 };
    el.textContent = '0' + suffix;
    ScrollTrigger.create({
      trigger: el, start: 'top 90%', once: true,
      onEnter: () => gsap.to(o, { v: end, duration: 2, ease: 'power3.out', onUpdate: () => { el.textContent = Math.round(o.v) + suffix; } }),
    });
  });
}
