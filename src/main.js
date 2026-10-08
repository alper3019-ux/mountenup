/**
 * MountenUp! – Einstiegspunkt der Startseite.
 *
 * v2: Kein seitenweiter 3D-Hintergrund mehr. WebGL lebt nur im gepinnten
 * Abschnitt "Der Aufstieg" (#aufstieg) und wird dort lazy geladen
 * (src/js/climb-story.js -> src/webgl/climb.js). Alle übrigen Abschnitte sind
 * reine Foto-/Text-Layouts ohne Ebene dahinter.
 * Kein Custom-Cursor und keine Magnet-Buttons: Es gilt der native Mauszeiger.
 */
import './styles/main.css';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { $, prefersReducedMotion as reduced } from './js/utils.js';
import { createSmoothScroll } from './js/smooth-scroll.js';
import { runPreloader, exitPreloader } from './js/preloader.js';
import { setupAnimations, heroIntro } from './js/animations.js';
import { setupClimbStory } from './js/climb-story.js';
import { setupNavigation } from './js/navigation.js';
import { setupContactForm } from './js/contact-form.js';

document.documentElement.classList.add('js');

const { lenis, scrollTo } = createSmoothScroll({ reduced });
setupNavigation({ lenis, scrollTo });
setupContactForm();
const year = $('[data-year]');
if (year) year.textContent = new Date().getFullYear();

// Hero-Foto als Ladeziel für den Preloader (LCP), nicht mehr die 3D-Szene
const heroImg = $('.hero__photo img');
const heroReady = heroImg?.decode ? heroImg.decode().catch(() => {}) : Promise.resolve();

runPreloader({ reduced, sceneReady: heroReady }).then(() => {
  setupClimbStory({ reduced });   // Pin zuerst anlegen (ScrollTrigger: in Seitenreihenfolge erzeugen)
  setupAnimations({ reduced });
  exitPreloader({
    reduced,
    onReveal: () => heroIntro({ reduced }),
    onDone: () => {
      lenis?.start();
      ScrollTrigger.refresh();
    },
  });
});
