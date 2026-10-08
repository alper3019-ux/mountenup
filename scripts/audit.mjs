// Lighthouse (mobil + desktop, Median aus N Läufen) + axe-core (desktop + mobil) + Transfergrößen.
// Nutzung: node scripts/audit.mjs <url> <outDir> [runs]   z. B. npm run audit -- https://miguel-3d-kairos.netlify.app/ reports/after 3
// Chrome-Pfad per CHROME=… überschreibbar.
import fs from 'node:fs';
import path from 'node:path';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import * as chromeLauncher from 'chrome-launcher';
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const [url, outDir, runsArg] = process.argv.slice(2);
const runs = Number(runsArg || 3);
fs.mkdirSync(outDir, { recursive: true });
const summary = { url, date: new Date().toISOString(), lighthouse: {}, axe: {}, transfer: {} };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

for (const formFactor of ['mobile', 'desktop']) {
  const results = [];
  for (let i = 0; i < runs; i++) {
    const chrome = await chromeLauncher.launch({ chromePath: (process.env.CHROME || '/usr/bin/google-chrome'), chromeFlags: ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const opts = { port: chrome.port, output: ['json', 'html'], logLevel: 'error' };
    const r = await lighthouse(url, opts, formFactor === 'desktop' ? desktopConfig : undefined);
    await chrome.kill();
    const lhr = r.lhr;
    const cat = Object.fromEntries(Object.entries(lhr.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
    const m = (id) => lhr.audits[id]?.numericValue;
    results.push({ cat, fcp: m('first-contentful-paint'), lcp: m('largest-contentful-paint'), tbt: m('total-blocking-time'), cls: m('cumulative-layout-shift'), si: m('speed-index'), bytes: m('total-byte-weight') });
    if (i === 0) {
      fs.writeFileSync(path.join(outDir, `lighthouse-${formFactor}.json`), r.report[0]);
      fs.writeFileSync(path.join(outDir, `lighthouse-${formFactor}.html`), r.report[1]);
      const failing = Object.values(lhr.audits).filter((a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative' && a.scoreDisplayMode !== 'manual' && a.scoreDisplayMode !== 'notApplicable')
        .map((a) => `${a.id} (${a.score}) ${a.displayValue || ''}`);
      fs.writeFileSync(path.join(outDir, `lighthouse-${formFactor}-failing-audits.txt`), failing.join('\n'));
    }
  }
  const keys = Object.keys(results[0].cat);
  summary.lighthouse[formFactor] = {
    runs,
    scoresMedian: Object.fromEntries(keys.map((k) => [k, median(results.map((r) => r.cat[k]))])),
    performancePerRun: results.map((r) => r.cat.performance),
    metricsMedian: Object.fromEntries(['fcp', 'lcp', 'tbt', 'cls', 'si', 'bytes'].map((k) => [k, Math.round(median(results.map((r) => r[k])) * 1000) / 1000])),
  };
  console.log(formFactor, JSON.stringify(summary.lighthouse[formFactor]));
}

// axe-core after preloader/intro finished, desktop + mobile
const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const browser = await chromium.launch({ executablePath: (process.env.CHROME || '/usr/bin/google-chrome'), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [name, opts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
  const page = await browser.newPage(opts);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.preloader', { state: 'detached', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3500);
  // scroll through the page so scroll-triggered reveals are in their final state
  await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
  await page.waitForTimeout(2500);
  await page.addScriptTag({ content: axeSrc });
  const res = await page.evaluate(async () => await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }));
  const v = res.violations.map((x) => ({ id: x.id, impact: x.impact, nodes: x.nodes.length, help: x.help, targets: x.nodes.slice(0, 5).map((n) => n.target.join(' ')) }));
  summary.axe[name] = { violations: v.length, nodes: v.reduce((s, x) => s + x.nodes, 0), list: v };
  fs.writeFileSync(path.join(outDir, `axe-${name}.json`), JSON.stringify(res, null, 2));
  console.log('axe', name, v.length, 'violations', JSON.stringify(v.map((x) => `${x.id}:${x.impact}:${x.nodes}`)));
  await page.close();
}
// transfer sizes of all requests on load (from network)
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const reqs = [];
page.on('response', async (r) => { try { const s = await r.request().sizes(); reqs.push({ url: r.url(), type: r.request().resourceType(), status: r.status(), transfer: s.responseBodySize + s.responseHeadersSize, encoding: r.headers()['content-encoding'] || '' }); } catch {} });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
summary.transfer = { totalBytes: reqs.reduce((s, r) => s + r.transfer, 0), requests: reqs.length, thirdPartyHosts: [...new Set(reqs.map((r) => new URL(r.url).host).filter((h) => !url.includes(h)))], list: reqs };
console.log('transfer', summary.transfer.totalBytes, 'bytes in', reqs.length, 'requests; third-party:', summary.transfer.thirdPartyHosts.join(', '));
await browser.close();
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
