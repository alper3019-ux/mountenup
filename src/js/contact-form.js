/**
 * Kontaktformular. Versandart über VITE_FORM_MODE (siehe .env / netlify.toml):
 *   "netlify" – POST an Netlify Forms per fetch (kein Seitenwechsel)
 *   "mailto"  – öffnet das E-Mail-Programm mit vorbereiteter Nachricht an VITE_CONTACT_EMAIL
 *   "demo"    – kein Versand; die Seite sagt das offen (keine vorgetäuschte Erfolgsmeldung)
 *
 * Barrierefreie Fehlermeldungen (MDN: aria-invalid):
 * - aria-invalid="true" erst NACH dem Absenden-Versuch setzen, nicht vorab
 * - jede Fehlermeldung ist per aria-describedby mit ihrem Feld verbunden
 * - der Fokus springt auf das erste fehlerhafte Feld
 * Statusmeldungen laufen über die Live-Region .form__status (role="status").
 */
import { $, $$ } from './utils.js';

const MODE = import.meta.env.VITE_FORM_MODE || 'netlify';
const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL || '';

const NOTES = {
  demo: 'Demo-Version: Dieses Formular sendet und speichert keine Daten. MountenUp! und die Kontaktadresse sind fiktiv.',
  mailto: `Beim Absenden öffnet sich Ihr E-Mail-Programm mit einer vorbereiteten Nachricht an ${CONTACT_EMAIL}. Verschickt ist sie erst, wenn Sie sie dort absenden.`,
};

export function setupContactForm() {
  const form = $('.form');
  if (!form) return;
  const status = $('.form__status', form);
  const note = $('#form-note', form);
  if (NOTES[MODE] && note) { note.textContent = NOTES[MODE]; note.hidden = false; }

  function setInvalid(input, invalid) {
    input.closest('.field, .check')?.classList.toggle('is-invalid', invalid);
    if (invalid) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  function validate() {
    const invalid = [];
    $$('[required]', form).forEach((input) => {
      const ok = input.type === 'checkbox' ? input.checked : input.checkValidity() && input.value.trim() !== '';
      setInvalid(input, !ok);
      if (!ok) invalid.push(input);
    });
    return invalid;
  }

  // Fehlerzustand verschwindet, sobald das Feld korrigiert wird
  form.addEventListener('input', (e) => {
    const input = e.target;
    if (input.getAttribute('aria-invalid') !== 'true') return;
    const ok = input.type === 'checkbox' ? input.checked : input.checkValidity() && input.value.trim() !== '';
    if (ok) setInvalid(input, false);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.className = 'form__status mono';
    const invalid = validate();
    if (invalid.length) {
      status.textContent = invalid.length === 1
        ? 'Bitte prüfen Sie das markierte Feld.'
        : `Bitte prüfen Sie die ${invalid.length} markierten Felder.`;
      status.classList.add('is-err');
      invalid[0].focus();
      return;
    }
    if (MODE === 'demo') {
      status.textContent = 'Demo-Modus: Ihre Angaben sind vollständig, wurden aber nicht gesendet und nicht gespeichert.';
      return;
    }
    if (MODE === 'mailto') {
      const data = new FormData(form);
      const body = [
        `Name: ${data.get('name')}`, `E-Mail: ${data.get('email')}`,
        `Interesse: ${data.get('budget') || '–'}`, '', String(data.get('nachricht')),
      ].join('\n');
      window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Touranfrage über die Website')}&body=${encodeURIComponent(body)}`;
      status.textContent = 'Ihr E-Mail-Programm sollte sich jetzt öffnen. Bitte senden Sie die Nachricht dort ab.';
      return;
    }
    status.textContent = 'Wird gesendet …';
    try {
      const res = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(new FormData(form)).toString(),
      });
      if (!res.ok) throw new Error(String(res.status));
      form.classList.add('is-sent');
      form.reset();
      status.textContent = 'Danke! Ihre Anfrage ist bei uns.';
      status.classList.add('is-ok');
    } catch (err) {
      status.textContent = `Das hat leider nicht geklappt. Schreiben Sie uns gern direkt an ${CONTACT_EMAIL}.`;
      status.classList.add('is-err');
    }
  });
}
