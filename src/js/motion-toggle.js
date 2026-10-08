/**
 * Globaler Pause-Schalter für alle automatisch laufenden Animationen.
 * WCAG 2.2.2 (Pausieren, Stoppen, Ausblenden): Bewegung, die automatisch
 * startet, länger als 5 s läuft und parallel zu anderen Inhalten gezeigt
 * wird, braucht einen Mechanismus zum Anhalten. Ein reines :hover-Pausieren
 * (Marquee) reicht dafür nicht – Tastatur- und Touch-Nutzer:innen erreichen es nicht.
 *
 * Pausiert: CSS-Endlosanimationen (Marquee, Grain, Pulse, Karten) per Klasse
 * auf <html> sowie die Eigenbewegung des WebGL-Objekts. Scroll-gesteuerte
 * Animationen bleiben aktiv, weil sie nur auf Nutzeraktion reagieren.
 * Der Zustand wird bewusst nicht gespeichert (kein localStorage/Cookie).
 */
import { $ } from './utils.js';

export function setupMotionToggle({ getScene }) {
  const btn = $('.motion-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const paused = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(paused));
    document.documentElement.classList.toggle('motion-paused', paused);
    getScene()?.setPaused(paused);
  });
}

/** Für später geladene Szenen: aktuellen Zustand übernehmen. */
export const isMotionPaused = () => document.documentElement.classList.contains('motion-paused');
