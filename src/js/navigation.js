/**
 * Navigation: Ein-/Ausblenden beim Scrollen, mobiles Menü, Anker-Links.
 *
 * Mobiles Menü nach dem APG-Muster "Disclosure Navigation" (W3C):
 * - Button mit aria-expanded / aria-controls
 * - Escape schließt das Menü und setzt den Fokus zurück auf den Button
 * - solange das Vollbild-Menü offen ist, sind <main> und <footer> `inert`
 *   (nicht fokussierbar, für Screenreader ausgeblendet – MDN: HTMLElement.inert)
 */
import { $, $$ } from './utils.js';

export function setupNavigation({ lenis, scrollTo }) {
  const nav = $('.nav');
  const burger = $('.nav__burger');
  const menu = $('#menu');
  const background = $$('main, footer, .skip-link');
  let lastY = 0;

  // Nav verstecken beim Runterscrollen, zeigen beim Hochscrollen
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    nav.classList.toggle('is-scrolled', y > 40);
    if (!isOpen()) nav.classList.toggle('is-hidden', y > lastY && y > window.innerHeight * 0.6);
    lastY = y;
  }, { passive: true });

  // Tastaturfokus in der Nav -> Nav immer sichtbar machen
  nav.addEventListener('focusin', () => nav.classList.remove('is-hidden'));

  const isOpen = () => document.body.classList.contains('menu-open');

  function setMenu(open, { returnFocus = false } = {}) {
    if (open === isOpen()) return;
    document.body.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
    menu.setAttribute('aria-hidden', String(!open));
    background.forEach((el) => { el.inert = open; });
    if (open) { lenis?.stop(); nav.classList.remove('is-hidden'); } else { lenis?.start(); }
    if (returnFocus) burger.focus();
  }

  burger.addEventListener('click', () => setMenu(!isOpen()));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) setMenu(false, { returnFocus: true });
  });
  // Wird das Fenster breit (Desktop-Nav sichtbar), Menü schließen
  window.matchMedia('(min-width: 861px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });

  // Anker-Links: sanft scrollen statt springen
  $$('a[data-scroll]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (!id || !id.startsWith('#')) return;
      e.preventDefault();
      const wasOpen = isOpen();
      setMenu(false);
      setTimeout(() => scrollTo(id === '#top' ? 0 : id), wasOpen ? 250 : 0);
      history.replaceState(null, '', id);
    });
  });
  $('.footer__totop').addEventListener('click', () => scrollTo(0));
}
