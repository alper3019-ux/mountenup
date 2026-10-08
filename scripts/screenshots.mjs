/**
 * Visuelle Prüfung v2 mit Playwright + Chrome (Software-WebGL via SwiftShader).
 * Screenshots: Hero, Aufstieg (mehrere Scroll-Positionen), saubere Foto-Sektionen,
 * Mobil, reduzierte Bewegung. Meldet Konsolenfehler/-warnungen, Seitenfehler,
 * HTTP-Fehler (>= 400) und Drittanbieter-Requests.
 *
 *   URL=https://… OUT=screens/v3 node scripts/screenshots.mjs [desktop|mobile|reduced|all]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:4173/';
const OUT = process.env.OUT || 'screens/v3';
const mode = process.argv[2] || 'all';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const origin = new globalThis.URL(URL).origin;
let failed = false;

async function run(name, ctxOpts, { climb = [], sections = [], reduced = false } = {}) {
  const ctx = await browser.newContext({ ...ctxOpts, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errors = [], thirdParty = new Set(), bad = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
  page.on('request', (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith('data:')) thirdParty.add(r.url()); });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.preloader', { state: 'detached', timeout: 20000 });
  await page.waitForTimeout(3200);
  await page.screenshot({ path: `${OUT}/${name}-hero.png` });
  for (const f of climb) {
    await page.evaluate((f) => { const s = document.querySelector('#aufstieg'); const top = s.getBoundingClientRect().top + scrollY; window.scrollTo(0, top + f * Math.max(0, s.offsetHeight - innerHeight)); }, f);
    await page.waitForTimeout(2600);
    const st = await page.evaluate(() => { const s = document.querySelector('#aufstieg'); return `p=${s.dataset.progress} Höhe=${s.dataset.altitude} m ready=${s.classList.contains('is-ready')}`; });
    const file = `${OUT}/${name}-climb-${String(Math.round(f * 100)).padStart(2, '0')}.png`;
    await page.screenshot({ path: file });
    console.log(`${name}: ${file}  ${st}`);
  }
  for (const id of sections) {
    await page.evaluate((id) => window.scrollTo(0, document.getElementById(id).getBoundingClientRect().top + scrollY), id);
    await page.waitForTimeout(2600);
    await page.screenshot({ path: `${OUT}/${name}-${id}.png` });
  }
  console.log(`${name}: Konsole ${errors.length ? errors.join(' | ') : 'keine Fehler/Warnungen'}; HTTP>=400: ${bad.length ? bad.join(', ') : 'keine'}; Drittanbieter: ${thirdParty.size}`);
  if (errors.length || bad.length || thirdParty.size) failed = true;
  await ctx.close();
}

if (mode === 'all' || mode === 'desktop') await run('desktop', { viewport: { width: 1440, height: 900 } }, { climb: [0, 0.3, 0.55, 0.8, 1], sections: ['touren', 'warum', 'galerie', 'ablauf', 'stimmen', 'kontakt'] });
if (mode === 'all' || mode === 'mobile') await run('mobile', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, { climb: [0.3, 1], sections: ['touren', 'galerie'] });
if (mode === 'all' || mode === 'reduced') await run('reduced', { viewport: { width: 1440, height: 900 } }, { climb: [0], sections: ['galerie'], reduced: true });
await browser.close();
process.exitCode = failed ? 1 : 0;
