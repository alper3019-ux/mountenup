/**
 * Interaktionstests (Tastatur/ARIA) gegen die laufende Seite:
 * Mobiles Menü (Escape, Fokus, inert), Pause-Schalter, Formular-Fehler.
 *   URL=http://localhost:4173/ node scripts/interaction-test.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://localhost:4173/';
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const results = [];

/** Zählt abweichende Pixel zweier PNG-Screenshots (Base64) im Browser per Canvas. */
async function pixelDiff(a, b) {
  const p = await browser.newPage();
  const r = await p.evaluate(async ([a, b]) => {
    const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const data = (img) => { const c = new OffscreenCanvas(img.width, img.height); const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data; };
    const da = data(ia), db = data(ib);
    let changed = 0;
    for (let i = 0; i < da.length; i += 4) if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) changed++;
    return { changed, total: da.length / 4 };
  }, [a, b]);
  await p.close();
  return { ...r, ratio: r.changed / r.total };
}
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  – ' + detail : ''}`); };

// --- Mobil: Menü ---
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.preloader', { state: 'detached', timeout: 15000 });
  await page.focus('.nav__burger');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const open = await page.evaluate(() => ({
    expanded: document.querySelector('.nav__burger').getAttribute('aria-expanded'),
    mainInert: document.querySelector('main').inert, footerInert: document.querySelector('footer').inert,
  }));
  check('Menü öffnet per Tastatur (aria-expanded=true)', open.expanded === 'true');
  check('main + footer sind inert, solange Menü offen', open.mainInert && open.footerInert);
  await page.keyboard.press('Tab');
  const firstLink = await page.evaluate(() => document.activeElement?.closest('#menu') ? document.activeElement.textContent.trim() : document.activeElement?.className);
  check('Tab vom Button führt in die Menülinks', /Touren/.test(firstLink), firstLink);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const closed = await page.evaluate(() => ({
    expanded: document.querySelector('.nav__burger').getAttribute('aria-expanded'),
    focus: document.activeElement === document.querySelector('.nav__burger'),
    mainInert: document.querySelector('main').inert,
  }));
  check('Escape schließt Menü', closed.expanded === 'false');
  check('Fokus kehrt zum Menü-Button zurück', closed.focus);
  check('inert wird wieder entfernt', closed.mainInert === false);
  await ctx.close();
}

// --- Desktop: Pause-Schalter + Formular + Screenreader-Texte ---
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.preloader', { state: 'detached', timeout: 15000 });
  await page.waitForTimeout(4000); // Intro-Animation (≈3 s) abwarten

  // Kein Custom-Cursor: kein .cursor-Element, keine has-cursor-Klasse, native Zeiger auf Links/Fläche
  await page.mouse.move(700, 450);
  await page.hover('.tour');
  const cur = await page.evaluate(() => ({
    el: document.querySelectorAll('.cursor, [class*="cursor__"], [data-cursor]').length,
    cls: document.documentElement.classList.contains('has-cursor'),
    body: getComputedStyle(document.body).cursor,
    link: getComputedStyle(document.querySelector('.nav__cta')).cursor,
    tour: getComputedStyle(document.querySelector('.tour')).cursor,
  }));
  check('Kein Custom-Cursor (keine Elemente/Klassen, native Zeiger)', cur.el === 0 && !cur.cls && cur.body === 'auto' && cur.link === 'pointer' && cur.tour === 'auto', JSON.stringify(cur));
  const navY = async () => page.evaluate(() => getComputedStyle(document.querySelector('.nav')).transform);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
  const before = await navY();
  const btnBox = await page.locator('.nav__cta').boundingBox();
  await page.mouse.move(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2); await page.waitForTimeout(800);
  const after = await navY();
  const moved = await page.evaluate(() => { const b = document.querySelector('.nav__cta'); const t = getComputedStyle(b).transform; return t; });
  check('Buttons bewegen sich beim Hover nicht (kein Magnet-Effekt)', before === after && (moved === 'none' || moved === 'matrix(1, 0, 0, 1, 0, 0)'), `nav ${before} -> ${after}, btn ${moved}`);

  await page.click('.motion-toggle');
  const paused = await page.evaluate(() => ({
    pressed: document.querySelector('.motion-toggle').getAttribute('aria-pressed'),
    cls: document.documentElement.classList.contains('motion-paused'),
    marquee: getComputedStyle(document.querySelector('.marquee__track')).animationPlayState,
  }));
  check('Pause-Schalter: aria-pressed=true + Klasse gesetzt', paused.pressed === 'true' && paused.cls);
  check('Marquee-Animation pausiert', paused.marquee === 'paused', paused.marquee);
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.animationName && a.playState === 'running').map((a) => a.animationName));
  check('Alle CSS-Endlosanimationen pausiert', running.length === 0, running.join(','));
  // WebGL-Frame vergleichen: bei Pause soll sich das Bild ohne Maus/Scroll nicht ändern.
  // Für den Pixelvergleich werden DOM-Ebenen über dem Canvas ausgeblendet (das Grain-Overlay
  // erzeugt beim Software-Compositing minimale Pixelabweichungen, obwohl seine Animation pausiert ist).
  const isolate = await page.addStyleTag({ content: 'body > *:not(canvas){visibility:hidden !important} body::before{display:none}' });
  const shot = async () => (await page.screenshot()).toString('base64');
  await page.waitForTimeout(4500); // exponentielle Glättung von Maus-/Scrollwerten ausklingen lassen
  const a = await shot(); await page.waitForTimeout(1200); const b = await shot();
  const still = await pixelDiff(a, b);
  check('WebGL-Objekt steht still, wenn pausiert (< 0,01 % Pixel abweichend)', still.ratio < 0.0001, `${still.changed} von ${still.total} Pixeln`);
  await page.evaluate(() => document.querySelector('.motion-toggle').click());
  const c = await shot(); await page.waitForTimeout(1200); const d = await shot();
  const moving = await pixelDiff(c, d);
  check('WebGL-Objekt bewegt sich wieder nach erneutem Klick', moving.ratio > 0.001, `${moving.changed} Pixel abweichend`);
  await isolate.evaluate((el) => el.remove());

  const sr = await page.evaluate(() => ({
    h1: document.querySelector('h1').innerText.replace(/\s+/g, ' ').trim(),
    h1Hidden: [...document.querySelectorAll('h1 .line')].every((l) => l.getAttribute('aria-hidden') === 'true'),
    prohibited: document.querySelectorAll('span[aria-label], p[aria-label], div[aria-label]:not([role])').length,
  }));
  check('Hero-Headline: zerlegte Zeilen aria-hidden, SR-Kopie vorhanden', sr.h1Hidden && /Höher, als du denkst\./.test(sr.h1), sr.h1);
  check('Keine aria-label auf span/p/div ohne Rolle', sr.prohibited === 0, String(sr.prohibited));

  await page.evaluate(() => document.querySelector('#kontakt').scrollIntoView());
  await page.fill('#f-mail', 'keine-mail');
  await page.click('.form button[type=submit]');
  await page.waitForTimeout(200);
  const form = await page.evaluate(() => ({
    invalid: [...document.querySelectorAll('.form [aria-invalid="true"]')].map((e) => e.name),
    focus: document.activeElement?.id,
    status: document.querySelector('.form__status').textContent,
    described: document.querySelector('#f-mail').getAttribute('aria-describedby'),
    errVisible: getComputedStyle(document.querySelector('#f-mail-err')).display !== 'none',
  }));
  check('Formular: aria-invalid auf allen fehlerhaften Pflichtfeldern', form.invalid.join(',') === 'name,email,nachricht,datenschutz', form.invalid.join(','));
  check('Formular: Fokus auf erstem fehlerhaften Feld', form.focus === 'f-name', form.focus);
  check('Formular: Fehlermeldung sichtbar + per aria-describedby verknüpft', form.errVisible && form.described === 'f-mail-err');
  check('Formular: Statusmeldung in Live-Region', /markierten Felder/.test(form.status), form.status);
  await page.fill('#f-name', 'Test');
  const nameAfter = await page.evaluate(() => document.querySelector('#f-name').getAttribute('aria-invalid'));
  check('Formular: aria-invalid verschwindet nach Korrektur', nameAfter === null);

  // Gültiges Absenden: im Demo-Modus (GitHub Pages) darf KEINE Erfolgsmeldung erscheinen
  await page.fill('#f-mail', 'test@example.com');
  await page.fill('#f-msg', 'Testnachricht');
  await page.check('input[name=datenschutz]', { force: true });
  const note = await page.evaluate(() => { const n = document.querySelector('#form-note'); return n && !n.hidden ? n.textContent : ''; });
  if (note) {
    await page.click('.form button[type=submit]');
    await page.waitForTimeout(300);
    const st = await page.evaluate(() => ({ text: document.querySelector('.form__status').textContent, sent: document.querySelector('.form').classList.contains('is-sent') }));
    check('Formular (Demo/Mailto): Hinweis sichtbar', note.length > 20, note);
    check('Formular (Demo/Mailto): keine vorgetäuschte Erfolgsmeldung', !st.sent && !/Danke/.test(st.text), st.text);
  }
  await ctx.close();
}
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} bestanden`);
process.exitCode = failed ? 1 : 0;
