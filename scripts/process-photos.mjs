/**
 * Erzeugt aus den Original-Fotos (Wikimedia Commons, siehe photos/sources.json)
 * responsive AVIF- und WebP-Dateien in public/photos/ sowie public/photos/manifest.json.
 *
 *   PHOTO_SRC=/pfad/zu/originalen node scripts/process-photos.mjs
 *
 * Die Originale (bis 48 MB) liegen bewusst NICHT im Repository; sie lassen sich
 * über die Datei-URLs in photos/sources.json erneut herunterladen (SHA-1 dort hinterlegt).
 * Bearbeitung: nur Skalieren, Zuschneiden und Formatkonvertierung (keine Retusche).
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = process.env.PHOTO_SRC || '/workspace/mountenup-photos/orig';
const OUT = resolve('public/photos');
mkdirSync(OUT, { recursive: true });
const sources = JSON.parse(readFileSync('photos/sources.json', 'utf8'));

// aspect: Zielseitenverhältnis (B/H) oder null = Original; fx/fy: Bildschwerpunkt für den Zuschnitt (0…1)
const JOBS = [
  { key: 'hero', variants: [
    { name: 'hero', aspect: null, widths: [960, 1440, 1920, 2560] },
    { name: 'hero-portrait', aspect: 9 / 16, fx: 0.55, fy: 0.5, widths: [480, 720, 1080] },
  ] },
  { key: 'tour-hochtour', variants: [{ name: 'tour-hochtour', aspect: 4 / 5, fx: 0.5, fy: 0.55, widths: [480, 800, 1200] }] },
  { key: 'tour-klettern', variants: [{ name: 'tour-klettern', aspect: 4 / 5, fx: 0.5, fy: 0.38, widths: [480, 800, 1200] }] },
  { key: 'tour-expedition', variants: [{ name: 'tour-expedition', aspect: 4 / 5, fx: 0.5, fy: 0.5, widths: [480, 800, 1200] }] },
  { key: 'band-matterhorn', variants: [{ name: 'band-matterhorn', aspect: null, widths: [960, 1600, 2400] }] },
  { key: 'gal-amadablam', variants: [{ name: 'gal-amadablam', aspect: null, widths: [640, 1024, 1600] }] },
  { key: 'gal-sella', variants: [{ name: 'gal-sella', aspect: 2.2, fx: 0.5, fy: 0.5, widths: [960, 1600, 2400] }] },
  { key: 'gal-riffelsee', variants: [{ name: 'gal-riffelsee', aspect: null, widths: [480, 800, 1200] }] },
  { key: 'gal-zermatt', variants: [{ name: 'gal-zermatt', aspect: null, widths: [640, 1024, 1600] }] },
  { key: 'gal-tous', variants: [{ name: 'gal-tous', aspect: null, widths: [480, 800, 1200] }] },
  { key: 'gal-chola', variants: [{ name: 'gal-chola', aspect: null, widths: [640, 1024, 1600] }] },
  { key: 'gal-gorner', variants: [{ name: 'gal-gorner', aspect: 2.2, fx: 0.5, fy: 0.5, widths: [960, 1600, 2400] }] },
];

function cropBox(w, h, aspect, fx = 0.5, fy = 0.5) {
  if (!aspect) return { left: 0, top: 0, width: w, height: h };
  let cw = w, ch = Math.round(w / aspect);
  if (ch > h) { ch = h; cw = Math.round(h * aspect); }
  const left = Math.round(Math.min(Math.max(fx * w - cw / 2, 0), w - cw));
  const top = Math.round(Math.min(Math.max(fy * h - ch / 2, 0), h - ch));
  return { left, top, width: cw, height: ch };
}

sharp.concurrency(2);
const manifest = {};
let total = 0;
for (const job of JOBS) {
  const src = resolve(SRC, sources[job.key].file);
  const meta = await sharp(src, { limitInputPixels: false }).metadata();
  const [W, H] = (meta.orientation || 1) >= 5 ? [meta.height, meta.width] : [meta.width, meta.height];
  for (const v of job.variants) {
    const box = cropBox(W, H, v.aspect, v.fx, v.fy);
    const base = sharp(src, { limitInputPixels: false }).rotate().extract(box);
    const cropped = await base.toBuffer(); // einmal dekodieren, dann mehrfach skalieren
    const files = [];
    for (const w of v.widths.filter((x) => x <= box.width)) {
      const h = Math.round((w * box.height) / box.width);
      const img = sharp(cropped, { limitInputPixels: false }).resize(w, h, { kernel: 'lanczos3' }).withMetadata({ orientation: undefined });
      const avif = await img.clone().avif({ quality: 52, effort: 5 }).toBuffer();
      const webp = await img.clone().webp({ quality: 74, effort: 6 }).toBuffer();
      writeFileSync(resolve(OUT, `${v.name}-${w}.avif`), avif);
      writeFileSync(resolve(OUT, `${v.name}-${w}.webp`), webp);
      total += avif.length + webp.length;
      files.push({ w, h, avif: avif.length, webp: webp.length });
    }
    manifest[v.name] = { source: job.key, width: files.at(-1).w, height: files.at(-1).h, files };
    console.log(v.name, box, files.map((f) => `${f.w}w avif ${(f.avif / 1024).toFixed(0)}K webp ${(f.webp / 1024).toFixed(0)}K`).join(' | '));
  }
}

// OG-Bild (1200×630, JPEG) aus dem Hero-Foto
const heroSrc = resolve(SRC, sources.hero.file);
const hm = await sharp(heroSrc).metadata();
await sharp(heroSrc).rotate().extract(cropBox(hm.width, hm.height, 1200 / 630, 0.55, 0.55)).resize(1200, 630).jpeg({ quality: 78, mozjpeg: true }).toFile('public/og.jpg');

writeFileSync(resolve(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log('gesamt', (total / 1024 / 1024).toFixed(1), 'MB');
