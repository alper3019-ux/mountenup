/**
 * Produktionsnaher lokaler Server für dist/ (für Messungen ohne Deploy):
 * Brotli-Kompression für Textdateien, Cache-Header wie in public/_headers,
 * 404.html als Fehlerseite.
 *   node scripts/serve-dist.mjs [ordner=dist] [port=4180]
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';

const root = process.argv[2] || 'dist';
const port = Number(process.env.PORT || process.argv[3] || 4180);
const BASE = (process.env.BASE || '/').replace(/\/$/, '');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2' };
const compressible = new Set(['.html', '.js', '.css', '.svg', '.json', '.xml', '.txt']);

http.createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  if (BASE && (path === BASE || path.startsWith(BASE + '/'))) path = path.slice(BASE.length) || '/';
  if (path.endsWith('/')) path += 'index.html';
  let file = join(root, path);
  let status = 200;
  try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); await stat(file); }
  catch { file = join(root, '404.html'); status = 404; try { await stat(file); } catch { res.writeHead(404); res.end('not found'); return; } }
  const ext = extname(file);
  let body = await readFile(file);
  const headers = { 'Content-Type': types[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' };
  headers['Cache-Control'] = path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate';
  if (compressible.has(ext) && /\bbr\b/.test(req.headers['accept-encoding'] || '')) {
    body = brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } });
    headers['Content-Encoding'] = 'br';
    headers['Vary'] = 'Accept-Encoding';
  }
  res.writeHead(status, headers);
  res.end(body);
}).listen(port, () => console.log(`dist-Server: http://localhost:${port}/ (${root})`));
