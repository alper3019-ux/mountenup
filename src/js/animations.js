/**
 * GSAP-Animationen der Startseite (v2: ruhiger, bewusst gesetzte Übergänge).
 *
 * - Hero: Zeichen-Intro nach dem Preloader; beim Wegscrollen blendet der Text
 *   aus und das Foto zoomt minimal + dunkelt in --bg ab (Übergang zu #aufstieg).
 * - Abschnitte: Trennlinie zeichnet sich, Titelzeilen steigen maskiert auf,
 *   Bilder werden per clip-path aufgedeckt, Texte faden hoch. Alles einmalig.
 * - Keine Endlos-Animationen; nichts bewegt sich, solange nicht gescrollt wird.
 *
 * Barrierefreiheit: Die zerlegte Hero-Headline ist aria-hidden, eine
 * .visually-hidden-Kopie liefert Screenreadern den Satz am Stück.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { $$ } from './utils.js';

gsap.registerPlugin(ScrollTrigger, SplitText);

let heroChars = [];

/** Hero-Headline zeichenweise einblenden (nach dem Preloader). */
export function heroIntro({ reduced }) {
  if (reduced) {
    gsap.set(['.reveal-fade', heroChars], { autoAlpha: 1, clearProps: 'filter' });
    return;
  }
  gsap.timeline()
    .fromTo('.hero__photo', { scale: 1.08 }, { scale: 1, duration: 2.4, ease: 'expo.out' }, 0)
    .fromTo(heroChars,
      { autoAlpha: 0, yPercent: 60, filter: 'blur(12px)' },
      { autoAlpha: 1, yPercent: 0, filter: 'blur(0px)', duration: 1.3, ease: 'expo.out', stagger: { each: 0.035, from: 'start' },
        onComplete: () => gsap.set(heroChars, { clearProps: 'filter,willChange' }) }, 0.1)
    // opacity statt autoAlpha: Links/Buttons bleiben während der Einblendung per Tastatur erreichbar
    .fromTo('.hero .reveal-fade', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.1 }, 0.35)
    .fromTo('.nav > *', { opacity: 0, y: -16 }, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', stagger: 0.06 }, 0.4);
}

/** Wird einmal nach dem Preloader aufgerufen (nach setupClimbStory, damit der Pin zuerst existiert). */
export function setupAnimations({ reduced }) {
  $$('.hero__title [data-split="chars"]').forEach((el) => {
    const split = new SplitText(el, { type: 'chars,words', charsClass: 'char', aria: 'none' });
    heroChars.push(...split.chars);
  });
  gsap.set(heroChars, { autoAlpha: 0, willChange: 'transform, opacity, filter' });

  if (reduced) {
    gsap.set('.reveal-up, .reveal-fade', { autoAlpha: 1 });
    return;
  }

  // Hero -> Aufstieg: Text weicht nach oben, Foto zoomt leicht und dunkelt ab
  const heroST = { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true };
  // opacity statt autoAlpha: h1 + Links bleiben im Accessibility-Tree und fokussierbar
  gsap.to('.hero__inner', { yPercent: -12, opacity: 0, ease: 'power1.in', scrollTrigger: heroST });
  gsap.to('.hero__media', { scale: 1.06, ease: 'none', scrollTrigger: heroST });
  gsap.to('.hero__scrim', { backgroundColor: 'rgba(11,18,25,.7)', ease: 'none', scrollTrigger: heroST });

  // Aufstieg: Titel einmalig einblenden, wenn die Bühne erscheint
  // opacity statt autoAlpha: Überschrift bleibt im Accessibility-Tree (Lighthouse heading-order)
  gsap.from('.climb__head > *', {
    opacity: 0, y: 30, duration: 1.1, ease: 'expo.out', stagger: 0.08,
    scrollTrigger: { trigger: '#aufstieg', start: 'top 60%', once: true },
  });

  // Trennlinien der Abschnitte zeichnen sich beim Eintritt
  $$('main .section').forEach((sec) => {
    gsap.fromTo(sec, { '--seam': 0 }, {
      '--seam': 1, duration: 1.4, ease: 'expo.inOut',
      scrollTrigger: { trigger: sec, start: 'top 85%', once: true },
    });
  });

  // Abschnittstitel: maskierte Zeilen-Reveals (autoSplit teilt bei Resize neu)
  $$('[data-split="lines"]').forEach((el) => {
    SplitText.create(el, {
      type: 'lines', mask: 'lines', linesClass: 'split-line-inner', autoSplit: true,
      onSplit: (self) => gsap.from(self.lines, {
        yPercent: 110, duration: 1.2, ease: 'expo.out', stagger: 0.09,
        scrollTrigger: { trigger: el, start: 'top 85%', once: true },
      }),
    });
  });

  // Bilder: clip-path deckt von unten auf, Bild setzt sich aus leichtem Zoom
  $$('.reveal-img').forEach((fig) => {
    const pic = fig.querySelector('picture');
    const img = fig.querySelector('img');
    gsap.timeline({ scrollTrigger: { trigger: fig, start: 'top 85%', once: true } })
      .fromTo(pic, { clipPath: 'inset(100% 0% 0% 0% round 14px)' }, { clipPath: 'inset(0% 0% 0% 0% round 14px)', duration: 1.3, ease: 'expo.inOut' })
      .fromTo(img, { scale: 1.18 }, { scale: 1, duration: 1.8, ease: 'expo.out' }, 0.15)
      .fromTo(fig.querySelector('figcaption'), { opacity: 0 }, { opacity: 1, duration: 0.6 }, 0.9); // Bildnachweis bleibt für Screenreader lesbar
  });

  // Texte in Gruppen: Fade-up
  ScrollTrigger.batch('main .reveal-up', {
    start: 'top 88%', once: true,
    onEnter: (els) => gsap.fromTo(els, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.08, overwrite: true }),
  });

  // Footer-Wortmarke wächst herein (nur beim Scrollen)
  gsap.fromTo('.footer__word', { yPercent: 35, scaleY: 1.25, transformOrigin: '50% 100%' }, {
    yPercent: 0, scaleY: 1, ease: 'none',
    scrollTrigger: { trigger: '.footer', start: 'top bottom', end: 'bottom bottom', scrub: true },
  });

  ScrollTrigger.refresh();
}
