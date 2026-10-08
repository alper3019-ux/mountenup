/**
 * Steuerung für "Der Aufstieg" (#aufstieg) – unabhängig davon, ob WebGL lädt.
 *
 * - Pinnt die Bühne (ScrollTrigger pin + scrub), Fortschritt 0..1.
 * - Etappen-Texte und Höhenmesser reagieren direkt auf den Fortschritt (DOM).
 * - Die 3D-Szene (src/webgl/climb.js) wird per import() erst geladen, wenn der
 *   Abschnitt in die Nähe kommt, und rendert nur, solange er sichtbar ist.
 * - Reduzierte Bewegung: kein Pin, kein Scrub, alle Etappen sichtbar,
 *   Szene zeigt ein einziges statisches Bild (Figur am Gipfel).
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { $, $$ } from './utils.js';

gsap.registerPlugin(ScrollTrigger);

const fmt = new Intl.NumberFormat('de-DE');

export function setupClimbStory({ reduced }) {
  const section = $('#aufstieg');
  if (!section) return;
  const canvas = $('.climb__canvas', section);
  const chapters = $$('.chapter', section);
  const altEl = $('[data-altitude]', section);
  const fill = $('.altimeter__fill', section);
  const isMobile = window.matchMedia('(max-width: 860px)').matches;
  let climb = null;
  let progress = reduced ? 1 : 0;
  let sceneAltitude = false;

  const setAltitude = (m) => { altEl.textContent = fmt.format(m); section.dataset.altitude = String(m); };

  function setChapter(p) {
    chapters.forEach((li) => {
      const on = p >= Number(li.dataset.from) && p < Number(li.dataset.to);
      li.classList.toggle('is-active', on);
    });
  }

  function onProgress(p) {
    progress = p;
    section.dataset.progress = p.toFixed(3);
    setChapter(p);
    fill.style.transform = `scaleY(${p})`;
    if (!sceneAltitude) setAltitude(Math.round(2150 + p * (4164 - 2150))); // grobe Anzeige, bis die Szene präzise Werte liefert
    climb?.setProgress(p);
  }

  async function loadScene() {
    if (loadScene.started) return;
    loadScene.started = true;
    try {
      const { createClimb } = await import('../webgl/climb.js');
      climb = await createClimb(canvas, {
        reducedMotion: reduced, isMobile,
        onAltitude: (m) => { sceneAltitude = true; setAltitude(m); },
      });
      if (!climb) throw new Error('WebGL nicht verfügbar');
      await climb.warmup();
      gsap.ticker.add((t, dt) => climb.tick(dt / 1000));
      climb.setProgress(progress);
      climb.setActive(reduced || active);
      section.classList.add('is-ready');
    } catch (err) {
      document.documentElement.classList.add('no-webgl');
    }
  }

  let active = false;

  if (reduced) {
    section.classList.add('is-static');
    onProgress(1);
    ScrollTrigger.create({ trigger: section, start: 'top bottom+=50%', once: true, onEnter: loadScene });
    return { getClimb: () => climb };
  }

  // Pin + Scrub: Fortschritt über eine Strecke von 3,2 (mobil 2,6) Bildschirmhöhen
  ScrollTrigger.create({
    trigger: section,
    pin: '.climb__stage',
    start: 'top top',
    end: () => '+=' + Math.round(window.innerHeight * (isMobile ? 2.6 : 3.2)),
    scrub: true,
    anticipatePin: 1,
    onUpdate: (self) => onProgress(self.progress),
  });
  // Sichtbarkeit (inkl. Ein- und Ausfahrt): nur dann wird gerendert
  ScrollTrigger.create({
    trigger: section, start: 'top bottom', end: 'bottom top',
    onToggle: (self) => { active = self.isActive; climb?.setActive(active); },
  });
  // Szene vorladen, bevor der Abschnitt erreicht wird – oder spätestens im Leerlauf
  ScrollTrigger.create({ trigger: section, start: 'top bottom+=100%', once: true, onEnter: loadScene });
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200));
  idle(() => loadScene(), { timeout: 3000 });

  onProgress(0);
  return { getClimb: () => climb };
}
