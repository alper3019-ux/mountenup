/**
 * Erzeugt aus public/favicon.svg die Raster-Icons (Empfehlung Evil Martians
 * "How to Favicon"): favicon.ico (32×32), apple-touch-icon.png (180×180 mit
 * Hintergrund + Rand) und logo.png (512×512, für schema.org "logo").
 *   node scripts/make-icons.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync('public/favicon.svg', 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
const page = await browser.newPage();

async function render(size, { pad = 0, bg = 'transparent' } = {}) {
  await page.setViewportSize({ width: size, height: size });
  const inner = size - pad * 2;
  await page.setContent(`<html><body style="margin:0;background:${bg}">
    <div style="width:${size}px;height:${size}px;display:grid;place-items:center">
      <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div>
    </div></body></html>`);
  return page.screenshot({ type: 'png', omitBackground: bg === 'transparent' });
}

const png32 = await render(32);
const ico = Buffer.alloc(22);
ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);      // ICONDIR
ico.writeUInt8(32, 6); ico.writeUInt8(32, 7); ico.writeUInt8(0, 8); ico.writeUInt8(0, 9);
ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);                            // planes, bpp
ico.writeUInt32LE(png32.length, 14); ico.writeUInt32LE(22, 18);                 // size, offset
writeFileSync('public/favicon.ico', Buffer.concat([ico, png32]));
writeFileSync('public/apple-touch-icon.png', await render(180, { pad: 20, bg: '#0b1219' }));
writeFileSync('public/logo.png', await render(512));
await browser.close();
console.log('Icons geschrieben: favicon.ico, apple-touch-icon.png, logo.png');
