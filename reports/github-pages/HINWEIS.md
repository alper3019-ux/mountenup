# Messung auf GitHub Pages

- URL: https://alper3019-ux.github.io/mountenup/
- Datum: 08.10.2026, ca. 21:40 MESZ
- Ein einzelner Lighthouse-Lauf (13.5.0, Standard-Drosselung, Headless-Chrome mit SwiftShader-WebGL).
  Einzelläufe schwanken und sind nicht mit Mehrfach-Medianen vergleichbar.

| | Mobil | Desktop |
|---|---|---|
| Performance | 74 | 69 |
| Accessibility | 100 | 100 |
| Best Practices | 100 | 100 |
| SEO | 100 | 100 |
| Agentic Browsing | 100 | 100 |
| FCP | 2,2 s | 0,4 s |
| LCP | 3,5 s | 0,9 s |
| TBT | 440 ms | 658 ms |
| CLS | 0 | 0,011 |

axe-core 4.14.0: 0 Verstöße (Desktop und Mobil). Übertragung: ca. 459 KB in 13 Requests, keine Drittanbieter-Hosts.

GitHub Pages liefert Dateien mit `Cache-Control: max-age=600` aus; eigene Cache-Header sind dort nicht möglich.
