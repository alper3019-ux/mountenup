/**
 * Vite-Konfiguration. Ziel-Hosting wird über Umgebungsvariablen gesteuert
 * (Standardwerte in .env = GitHub Pages; netlify.toml überschreibt sie für Netlify):
 *
 *   VITE_BASE       Unterpfad der Seite, z. B. "/mountenup/" (GitHub Pages) oder "/" (Netlify)
 *   VITE_SITE_URL   absolute URL mit Schrägstrich am Ende (canonical, og:url, Sitemap)
 *   VITE_FORM_MODE  "netlify" (Netlify Forms) | "mailto" (E-Mail-Programm) | "demo" (kein Versand)
 *
 * In den HTML-Dateien werden %BASE_URL% und %VITE_…% beim Build ersetzt.
 */
import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';

/** Erzeugt robots.txt und sitemap.xml passend zur Ziel-URL. */
function seoFiles(siteUrl) {
  return {
    name: 'mountenup-seo-files',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}sitemap.xml\n` });
      this.emitFile({
        type: 'asset', fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Nur indexierbare Seiten. Impressum/Datenschutz/404 tragen "noindex". -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${siteUrl}</loc>\n    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>\n  </url>\n</urlset>\n`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const base = env.VITE_BASE || '/';
  return {
    base,
    plugins: [seoFiles(env.VITE_SITE_URL)],
    build: {
      outDir: 'dist',
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        input: {
          main: resolve(import.meta.dirname, 'index.html'),
          impressum: resolve(import.meta.dirname, 'impressum.html'),
          datenschutz: resolve(import.meta.dirname, 'datenschutz.html'),
          bildrechte: resolve(import.meta.dirname, 'bildrechte.html'),
          notfound: resolve(import.meta.dirname, '404.html'),
        },
      },
    },
  };
});
