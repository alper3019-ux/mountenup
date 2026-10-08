/**
 * Visuelle Prüfung mit Playwright + Chrome (Software-WebGL via SwiftShader).
 * Erstellt Screenshots und meldet Konsolenfehler/-warnungen, Seitenfehler,
 * fehlgeschlagene Requests, HTTP-Fehler, Drittanbieter-Requests und Cookies.
 *
 *   npm run build && npm run preview           # in einem Terminal
 *   node scripts/screenshots.mjs [desktop|mobile|reduced|all]
 *   URL=https://… OUT=screens/live node scripts/screenshots.mjs all
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:4173/';
const OUT = process.env.OUT || 'screens';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const origin = new globalThis.URL(URL).origin;
let failed = false;

async function run(name, ctxOpts, shots, extra = {}) {
  const ctx = await browser.newContext({ ...ctxOpts, reducedMotion: extra.reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  const thirdParty = new Set();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  page.on('requestfailed', (r) => errors.push('[requestfailed] ' + r.url() + ' ' + r.failure()?.errorText));
  page.on('request', (r) => { const u = r.url(); if (/^https?:/.test(u) && new globalThis.URL(u).origin !== origin) thirdParty.add(new globalThis.URL(u).host); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`[http ${r.status()}] ${r.url()}`); });
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.preloader', { state: 'detached', timeout: 15000 });
  const preloaderGoneMs = Date.now() - t0;
  await wait(2800);
  const webgl = await page.evaluate(() => !document.documentElement.classList.contains('no-webgl'));
  const info = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth, vw: innerWidth }));
  console.log(name, 'webgl:', webgl, info, 'preloader removed after', preloaderGoneMs, 'ms');
  for (const [label, sel, offset = 0] of shots) {
    if (sel) {
      await page.evaluate(([s, off]) => {
        const el = document.querySelector(s);
        const y = el.getBoundingClientRect().top + window.scrollY + off * window.innerHeight;
        window.scrollTo(0, y);
      }, [sel, offset]);
      await wait(2600);
    }
    await page.screenshot({ path: `${OUT}/${name}-${label}.png` });
  }
  const cookies = await ctx.cookies();
  const storage = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
  console.log(name, 'third-party hosts:', thirdParty.size ? [...thirdParty] : 'none');
  console.log(name, 'cookies:', cookies.map((c) => c.name), 'storage:', storage);
  console.log(name, 'errors:', errors.length ? errors : 'none');
  if (errors.length) failed = true;
  await ctx.close();
}

const which = process.argv[2] || 'all';
if (which === 'all' || which === 'desktop')
  await run('desktop', { viewport: { width: 1440, height: 900 } }, [
    ['hero', null], ['tours', '#touren', 0.15], ['band', '.band', 0], ['gallery', '#galerie', 0.1],
    ['process', '#ablauf', 0.15], ['stimmen', '#stimmen', 0.15], ['contact', '#kontakt', 0.15], ['footer', '.footer', 0],
  ]);
if (which === 'all' || which === 'mobile')
  await run('mobile', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, [
    ['hero', null], ['tours', '#touren', 0.1], ['gallery', '#galerie', 0.05], ['contact', '#kontakt', 0.1], ['footer', '.footer', 0],
  ]);
if (which === 'all' || which === 'reduced')
  await run('reduced', { viewport: { width: 1440, height: 900 } }, [['hero', null], ['gallery', '#galerie', 0.1]], { reduced: true });
await browser.close();
process.exitCode = failed ? 1 : 0;
