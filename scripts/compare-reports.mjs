/**
 * Erzeugt reports/VERGLEICH.md aus den summary.json-Dateien der Messläufe.
 *   node scripts/compare-reports.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const sets = [
  ['Live vorher (Netlify)', 'reports/before'],
  ['Lokal vorher (alter Build)', 'reports/local-before'],
  ['Lokal nachher (neuer Build)', 'reports/local-after'],
  ['Live nachher (Netlify)', 'reports/after'],
].filter(([, dir]) => existsSync(`${dir}/summary.json`))
  .map(([label, dir]) => [label, dir, JSON.parse(readFileSync(`${dir}/summary.json`, 'utf8'))]);

const cats = ['performance', 'accessibility', 'best-practices', 'seo', 'agentic-browsing'];
const metrics = [['fcp', 'FCP (ms)'], ['lcp', 'LCP (ms)'], ['tbt', 'TBT (ms)'], ['cls', 'CLS'], ['si', 'Speed Index (ms)'], ['bytes', 'Seitengewicht (Bytes)']];
const fmt = (v, k) => v == null ? '–' : k === 'cls' ? v.toFixed(3) : Math.round(v).toLocaleString('de-DE');
let md = `# Messvergleich vorher / nachher\n\nErzeugt am ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} (Europe/Berlin) mit \`scripts/compare-reports.mjs\`.\n\n`;
md += 'Methode: Lighthouse 13.5.0 (Node-API, Standard-Mobil-Profil bzw. Desktop-Config, simuliertes Throttling), mehrere Läufe je Messreihe (Anzahl siehe Zeile „Läufe“), **Median**; ' +
  'axe-core 4.14.0 (Tags wcag2a/aa, wcag21a/aa, wcag22aa, best-practice) nach Ende des Intros. Chrome headless mit Software-WebGL (SwiftShader) in einer Linux-VM – ' +
  'absolute Performance-Werte sind daher nicht mit echten Geräten vergleichbar, nur die Messungen untereinander.\n\n';
md += '„Lokal“ = beide Builds unter identischen Bedingungen über `scripts/serve-dist.mjs` (Brotli, gleiche Cache-Header wie Netlify, ohne Netlify-HUD-Skript).\n\n';
for (const ff of ['mobile', 'desktop']) {
  md += `## Lighthouse ${ff === 'mobile' ? 'Mobil' : 'Desktop'}\n\n| Kennzahl | ${sets.map((s) => s[0]).join(' | ')} |\n|---|${sets.map(() => '---:').join('|')}|\n`;
  md += `| Läufe | ${sets.map((s) => s[2].lighthouse[ff]?.runs ?? '–').join(' | ')} |\n`;
  for (const c of cats) md += `| ${c} | ${sets.map((s) => s[2].lighthouse[ff]?.scoresMedian?.[c] ?? '–').join(' | ')} |\n`;
  md += `| performance je Lauf | ${sets.map((s) => (s[2].lighthouse[ff]?.performancePerRun || []).join(' / ')).join(' | ')} |\n`;
  for (const [k, label] of metrics) md += `| ${label} | ${sets.map((s) => fmt(s[2].lighthouse[ff]?.metricsMedian?.[k], k)).join(' | ')} |\n`;
  md += '\n';
}
md += `## axe-core\n\n| | ${sets.map((s) => s[0]).join(' | ')} |\n|---|${sets.map(() => '---').join('|')}|\n`;
for (const v of ['desktop', 'mobile']) {
  md += `| ${v}: Verstöße / Knoten | ${sets.map((s) => `${s[2].axe[v].violations} / ${s[2].axe[v].nodes}`).join(' | ')} |\n`;
  md += `| ${v}: Regeln | ${sets.map((s) => s[2].axe[v].list.map((x) => `${x.id} (${x.nodes})`).join(', ') || '–').join(' | ')} |\n`;
}
md += `\n## Übertragung (beim Laden der Startseite)\n\n| | ${sets.map((s) => s[0]).join(' | ')} |\n|---|${sets.map(() => '---').join('|')}|\n`;
md += `| Bytes gesamt | ${sets.map((s) => s[2].transfer.totalBytes.toLocaleString('de-DE')).join(' | ')} |\n`;
md += `| Requests | ${sets.map((s) => s[2].transfer.requests).join(' | ')} |\n`;
md += `| Drittanbieter-Hosts | ${sets.map((s) => s[2].transfer.thirdPartyHosts.join(', ') || 'keine').join(' | ')} |\n\n`;
for (const [label, , s] of sets) {
  md += `<details><summary>${label}: Einzelne Requests</summary>\n\n| URL | Typ | Bytes | Enc. |\n|---|---|---:|---|\n`;
  for (const r of s.transfer.list) md += `| ${r.url.replace(/^https?:\/\/[^/]+/, (m) => m.includes('localhost') ? '' : m)} | ${r.type} | ${r.transfer.toLocaleString('de-DE')} | ${r.encoding || '–'} |\n`;
  md += '\n</details>\n\n';
}
if (existsSync('reports/ANMERKUNGEN.md')) md += '\n' + readFileSync('reports/ANMERKUNGEN.md', 'utf8');
writeFileSync('reports/VERGLEICH.md', md);
console.log('reports/VERGLEICH.md geschrieben');
