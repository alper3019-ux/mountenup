# Live-Messung v2 – https://alper3019-ux.github.io/mountenup/

Gemessen am 08.10.2026, ca. 22:33–22:36 MESZ, aus der Box (Headless Chrome, Software-WebGL
über SwiftShader). Ein Lighthouse-Lauf je Formfaktor (`node scripts/audit.mjs <url> <dir> 1`),
daher sind die Performance-Werte Einzelwerte mit Streuung.

| | Mobil | Desktop |
|---|---|---|
| Performance | 77 | 92 |
| Barrierefreiheit | 100 | 100 |
| Best Practices | 100 | 100 |
| SEO | 100 | 100 |
| LCP | 2,23 s | 0,46 s |
| TBT | 741 ms | 184 ms |
| CLS | 0 | 0,002 |

axe-core: 0 Verstöße (Desktop + Mobil). Interaktionstests: 26/26 (`interaction-test.txt`).
Alle 100 Dateien aus `dist/` liefern live HTTP 200; unbekannte Pfade 404.
