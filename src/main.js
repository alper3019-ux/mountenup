/**
 * MountenUp! – Einstiegspunkt der Startseite.
 *
 * Ablauf:
 * 1. Sofort: Styles, Smooth Scroll, Navigation, Formular, Uhr (kleines Haupt-Bundle).
 * 2. Parallel: Three.js + Szene werden per dynamischem import() als eigener
 *    Chunk nachgeladen (Code-Splitting), Shader asynchron kompiliert.
 * 3. Preloader wartet auf Schriften + 3D (max. 2,5 s), dann Hero-Intro.
 *    Kommt die 3D-Szene später, blendet sie sich nachträglich ein.
 * Ohne WebGL: CSS-Bergsilhouette (.no-webgl).
 * Kein Custom-Cursor und keine Magnet-Buttons: Es gilt der native Mauszeiger.
 */
import './styles/main.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { $, prefersReducedMotion as reduced } from './js/utils.js';
import { createSmoothScroll } from './js/smooth-scroll.js';
import { runPreloader, exitPreloader } from './js/preloader.js';
import { setupAnimations, heroIntro } from './js/animations.js';
import { setupNavigation } from './js/navigation.js';
import { setupMotionToggle, isMotionPaused } from './js/motion-toggle.js';
import { setupClock } from './js/clock.js';
import { setupContactForm } from './js/contact-form.js';

const root = document.documentElement;
root.classList.add('js');

/* ---------- 3D-Szene (lazy) ---------- */
let scene = null;
let introStarted = false;
const getScene = () => scene;

/** Gibt den Main-Thread kurz frei, damit Eingaben/Animationen zwischen großen Arbeitsschritten laufen. */
const yieldToMain = () => new Promise((resolve) => setTimeout(resolve, 0));

async function loadScene() {
  try {
    const { createScene } = await import('./webgl/scene.js');
    await yieldToMain();
    const s = createScene($('.webgl'), { reducedMotion: reduced });
    if (!s) throw new Error('WebGL nicht verfügbar');
    await yieldToMain();
    await s.warmup(); // Shader asynchron kompilieren (KHR_parallel_shader_compile, falls vorhanden)
    return s;
  } catch (err) {
    root.classList.add('no-webgl');
    return null;
  }
}

/** Szene in den Render-Loop hängen – egal ob vor oder nach dem Preloader fertig. */
function attachScene(s) {
  if (!s) return;
  scene = s;
  if (isMotionPaused()) scene.setPaused(true);
  gsap.ticker.add((t, dt) => scene.update(dt / 1000));
  scene.measure();
  if (introStarted) scene.intro(gsap);
}

const sceneReady = loadScene().then((s) => { attachScene(s); return s; });

/* ---------- Basis-Interaktionen (sofort) ---------- */
const { lenis, scrollTo } = createSmoothScroll({ reduced });
setupNavigation({ lenis, scrollTo });
setupMotionToggle({ getScene });
setupClock();
setupContactForm();

/* ---------- Preloader -> Intro ---------- */
runPreloader({ reduced, sceneReady }).then(() => {
  setupAnimations({ reduced, getScene });
  exitPreloader({
    reduced,
    onReveal: () => {
      introStarted = true;
      scene?.intro(gsap);
      heroIntro({ reduced });
    },
    onDone: () => {
      lenis?.start();
      ScrollTrigger.refresh();
    },
  });
});
