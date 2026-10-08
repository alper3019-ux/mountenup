# Live-Prüfung v3 (Kletter-Szene), 08.10.2026, ca. 23:31–23:37 MESZ

URL: https://alper3019-ux.github.io/mountenup/ – main 15edf79, gh-pages ca64577 (Fast-Forward, kein Force).

- Screenshots: `screens/v3/` (Konsole ohne Fehler/Warnungen, keine HTTP-Fehler, 0 Drittanbieter).
- Interaktionstest: 26/26 (`interaction-test.txt`), u. a. Aufstieg 2326→3365 m, Abstieg 3365→2678 m,
  ohne Scroll 0 neue Frames, verborgener Tab pausiert, Galerie ohne 3D.
- Lighthouse 13.5 (1 Lauf, SwiftShader-Headless-Chrome): mobil 75 / Desktop 86; A11y/BP/SEO 100.
  v2 lag bei 77 / 92 – die aufwendigere Szene kostet etwas Main-Thread-Zeit (TBT mobil 927 ms).
- axe 4.14: 0 Verstöße (Desktop + mobil, ganze Seite inkl. `#aufstieg`).
- Nicht-Kletter-Abschnitte: Pixelvergleich v2↔v3 (Hero, Touren, Warum, Galerie, Ablauf, Stimmen,
  Kontakt, mobil + reduced Galerie): 0 abweichende Pixel (Schwelle 16/255).
