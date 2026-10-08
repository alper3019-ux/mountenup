/**
 * Interaktionstests (Tastatur/ARIA) gegen die laufende Seite:
 * Mobiles Menü (Escape, Fokus, inert), Aufstieg-Szene (Scroll, Stillstand, Tab verborgen), Formular-Fehler.
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

  // --- v2: keine Endlos-Animationen, 3D nur im Abschnitt #aufstieg ---
  const infinite = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations === Infinity).map((a) => a.animationName || 'anim'));
  check('Keine Endlos-Animationen auf der Seite (kein Pause-Schalter nötig)', infinite.length === 0, infinite.join(','));
  const cv = await page.evaluate(() => { const c = [...document.querySelectorAll('canvas')]; return { n: c.length, inClimb: c.every((x) => x.closest('#aufstieg')), pos: c.map((x) => getComputedStyle(x).position).join(',') }; });
  check('Genau ein Canvas, nur in #aufstieg, nicht seitenweit fixiert', cv.n === 1 && cv.inClimb && cv.pos === 'absolute', JSON.stringify(cv));

  const climbAt = async (f) => {
    await page.evaluate((f) => { const s = document.querySelector('#aufstieg'); const top = s.getBoundingClientRect().top + scrollY; window.scrollTo(0, top + f * (s.offsetHeight - innerHeight)); }, f);
    await page.waitForTimeout(2500);
    return page.evaluate(() => { const s = document.querySelector('#aufstieg'); return { p: Number(s.dataset.progress), alt: Number(s.dataset.altitude), frames: Number(document.querySelector('.climb__canvas').dataset.frames || 0), ready: s.classList.contains('is-ready') }; });
  };
  const canvasShot = async () => (await page.locator('.climb__canvas').screenshot()).toString('base64');
  const s1 = await climbAt(0.15); const img1 = await canvasShot();
  const s2 = await climbAt(0.7); const img2 = await canvasShot();
  check('WebGL-Szene geladen (is-ready)', s1.ready && s2.ready);
  check('Scroll treibt den Aufstieg: Fortschritt + Höhe steigen', s2.p > s1.p + 0.4 && s2.alt > s1.alt + 300, `p ${s1.p} -> ${s2.p}, Höhe ${s1.alt} -> ${s2.alt} m`);
  const climbDiff = await pixelDiff(img1, img2);
  check('Canvas-Bild ändert sich mit dem Scroll (> 5 % Pixel)', climbDiff.ratio > 0.05, `${(climbDiff.ratio * 100).toFixed(1)} %`);
  // Stillstand: ohne Scroll kein neuer Frame und kein Pixelunterschied
  const f0 = await page.evaluate(() => Number(document.querySelector('.climb__canvas').dataset.frames));
  const st1 = await canvasShot(); await page.waitForTimeout(1500); const st2 = await canvasShot();
  const f1 = await page.evaluate(() => Number(document.querySelector('.climb__canvas').dataset.frames));
  const stillDiff = await pixelDiff(st1, st2);
  check('Ohne Scroll: keine neuen Frames, Bild steht (kein Dauer-Loop)', f1 === f0 && stillDiff.changed === 0, `Frames ${f0} -> ${f1}, ${stillDiff.changed} Pixel`);
  // Rückwärts scrollen = Abstieg
  const s3 = await climbAt(0.35);
  check('Hochscrollen lässt die Figur absteigen', s3.alt < s2.alt, `${s2.alt} -> ${s3.alt} m`);
  // Tab verborgen: kein Rendern
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const h0 = await page.evaluate(() => Number(document.querySelector('.climb__canvas').dataset.frames));
  await climbAt(0.6);
  const h1 = await page.evaluate(() => Number(document.querySelector('.climb__canvas').dataset.frames));
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(1500);
  const h2 = await page.evaluate(() => Number(document.querySelector('.climb__canvas').dataset.frames));
  check('Tab verborgen: Rendern pausiert, danach geht es weiter', h1 === h0 && h2 > h1, `Frames ${h0} -> ${h1} (verborgen) -> ${h2}`);
  // Nach dem Abschnitt: kein Canvas im Viewport, kein Rendern
  await page.evaluate(() => window.scrollTo(0, document.querySelector('#galerie').getBoundingClientRect().top + scrollY));
  await page.waitForTimeout(2000);
  const g = await page.evaluate(() => { const r = document.querySelector('.climb__canvas').getBoundingClientRect(); return { visible: r.bottom > 0 && r.top < innerHeight, frames: Number(document.querySelector('.climb__canvas').dataset.frames) }; });
  await page.evaluate(() => window.scrollBy(0, 400)); await page.waitForTimeout(1500);
  const g2 = await page.evaluate(() => Number(document.querySelector('.climb__canvas').dataset.frames));
  check('Galerie: kein 3D dahinter, Szene rendert nicht', !g.visible && g2 === g.frames, JSON.stringify({ ...g, after: g2 }));

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
