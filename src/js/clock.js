/**
 * Live-Uhr im Hero (Studio-Zeit Berlin) inkl. korrekter Zeitzone (MEZ/MESZ)
 * sowie das aktuelle Jahr im Footer.
 */
import { $ } from './utils.js';

export function setupClock() {
  const clock = $('[data-clock]');
  const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
  const zoneFmt = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', timeZoneName: 'short' });
  function tick() {
    const now = new Date();
    clock.textContent = timeFmt.format(now);
    const zone = zoneFmt.formatToParts(now).find((p) => p.type === 'timeZoneName')?.value || 'MEZ';
    clock.nextSibling.textContent = ' ' + zone;
  }
  tick();
  setInterval(tick, 15000);
  const year = $('[data-year]');
  if (year) year.textContent = new Date().getFullYear();
}
