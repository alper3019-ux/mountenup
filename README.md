# MountenUp!

Demonstrations-Website eines fiktiven Bergsport-Anbieters: geführte Bergtouren, Kletterkurse
und Expeditionen. Deutschsprachige Oberfläche, scroll-gesteuerte 3D-Erzählung „Der Aufstieg“,
echte Bergfotos.

**Live:** https://alper3019-ux.github.io/mountenup/
**Quellcode:** https://github.com/alper3019-ux/mountenup

> **Alles außer den Fotos ist fiktiv.** MountenUp! ist kein reales Unternehmen. Preise,
> Bergführernamen, Qualifikationen (auch die Formulierung „staatlich geprüfte Berg- und
> Skiführer“), Adressen, Telefonnummern und Gästestimmen sind Platzhalter und im Impressum
> als solche gekennzeichnet. Es werden keine echten Zertifizierungen behauptet.

## Technik

- Vite 8, Three.js (prozeduraler Berg + Figur aus Grundkörpern, keine externen 3D-Modelle),
  GSAP + ScrollTrigger, Lenis.
- Schriften selbst gehostet (Inter Tight, Instrument Serif, JetBrains Mono, SIL OFL 1.1,
  Dateien aus Fontsource, Lizenzen in `src/assets/fonts/`).
- Fotos selbst gehostet als AVIF + WebP in mehreren Breiten, `loading="lazy"` unterhalb
  des Hero, Bildnachweise auf `bildrechte.html`.
- Kein Custom-Cursor und keine Magnet-Buttons: Es gilt der native Mauszeiger.
- Kontaktformular im Demo-Modus: Es sendet und speichert nichts und zeigt das auch an.

## Seitenaufbau (v2)

Hero (Foto) → **Der Aufstieg** (gepinnte 3D-Szene) → Touren → Warum wir → Galerie → Ablauf →
Stimmen → Kontakt. Alle Abschnitte nutzen denselben Container (`.wrap`, max. 1360 px) und ein
12-Spalten-Raster; jede Sektion hat eine eigene Fläche (`--bg` / `--bg-2`) und eine Trennlinie.
Hinter den Inhalts-Sektionen liegt **kein** 3D – WebGL existiert nur in `#aufstieg`.

### „Der Aufstieg“ – wie die Animation funktioniert

- `src/js/climb-story.js`: ScrollTrigger pinnt `.climb__stage` (`pin`, `scrub: true`,
  `start: 'top top'`, Strecke 3,2 Bildschirmhöhen, mobil 2,6). Der Fortschritt 0…1 schaltet die
  vier Etappen-Texte, füllt den Höhenmesser und wird an die Szene übergeben.
- `src/webgl/climb.js`: prozeduraler Berg (Heightfield, Facetten-Shading), Route als
  `CatmullRomCurve3` über die Oberfläche, Figur aus Kapseln/Boxen (Helm, Rucksack, Pickel).
  Der Fortschritt wird exponentiell geglättet und über eine Tabelle (Mischung aus Weglänge und
  Höhengewinn) auf den Routenparameter abgebildet; `getPointAt()`/`getTangentAt()` liefern
  Position und Blickrichtung. Schritte hängen an der gegangenen Strecke, nicht an der Zeit.
  Kamera: Totale → Verfolgung → Gipfel-Totale; das Licht wird mit der Höhe wärmer.
  Hochscrollen = Abstieg (Figur dreht sich um).
- Kein Dauer-Loop: Es wird nur gerendert, wenn sich der Wert ändert, der Abschnitt sichtbar
  und der Tab nicht verborgen ist. Pixel-Ratio max. 1,75 (mobil 1,5). Three.js wird erst
  nachgeladen, wenn der Abschnitt näher kommt (oder im Leerlauf).
- Reduzierte Bewegung (`prefers-reduced-motion`): kein Pin/Scrub, ein statisches Bild (Figur am
  Gipfel), alle vier Etappen als Karten sichtbar. Ohne WebGL: Matterhorn-Foto als Hintergrund.
- Die Höhenangaben (2.150–4.164 m) sind illustrativ und als „Beispielroute“ markiert.

### Recherche-Quellen (geöffnet)

- Codrops, „How to Build Cinematic 3D Scroll Experiences with GSAP“ (19.11.2025) –
  gepinnter Abschnitt, Scroll-Fortschritt treibt Proxy-Werte im Render-Loop, Kapiteltexte.
- Codrops, „Building a Scroll-Driven 3D Gallery Using a Blender Camera Path with Three.js and
  GSAP“ (07.07.2026) – `CatmullRomCurve3`-Pfad, Bewegung über normierten Wert t.
- GSAP-Doku ScrollTrigger – `pin`, `scrub`, `anticipatePin`; gepinntes Element nicht selbst
  animieren; Trigger in Seitenreihenfolge anlegen.
- three.js-Doku `Curve` – `getPointAt`/`getTangentAt` mit gleichmäßigem Abstand.
- MDN `prefers-reduced-motion`.
- X: @greensock „Site of the Day“-Posts (ScrollTrigger + Three.js, Reduced Motion) und
  @codrops-Posts zu scroll-gesteuerten Three.js-Demos mit Reduced-Motion-Unterstützung.

## Fotos

Originale von Wikimedia Commons (SHA-1-geprüft beim Download), nur skaliert, zugeschnitten
und ins Webformat gewandelt. Lizenzen CC BY 3.0, CC BY 4.0, CC BY-SA 3.0 und CC BY-SA 4.0 –
alle erlauben die kommerzielle Nutzung bei Namensnennung; die SA-Varianten verlangen
Weitergabe von Bearbeitungen unter derselben Lizenz. Vollständige Tabelle mit Fotograf,
Datei-URL und Lizenzlink: Seite „Bildrechte“ bzw. `photos/sources.json`.

| Motiv | Datei (Wikimedia Commons) | Lizenz |
|---|---|---|
| Hero, Cresta Signal (Wallis) | Aux aurores sur la Cresta Signal.jpg | CC BY-SA 3.0, Nicola Beltraminelli |
| Hochtour, Aiguille du Midi | Alpinistes Aiguille du Midi 03.JPG | CC BY-SA 3.0, Benh LIEU SONG |
| Kletterkurs, Phra Nang | Rock climber Phra Nang 1.jpg | CC BY-SA 3.0, kallerna |
| Expedition, Imja Tse | Summitting Island Peak.jpg | CC BY 3.0, Mountaineer |
| Warum wir, Matterhorn | Matterhorn, March 2019 (01).jpg | CC BY-SA 4.0, Liridon |
| Gornergletscher | Wide view to Gornergletscher, Monte Rosa and Matterhorn, 2012 August.jpg | CC BY-SA 3.0, Ximonic (Simo Räsänen) |
| Ama Dablam | Himalayas, Ama Dablam, Nepal.jpg | CC BY 4.0, Vyacheslav Argenberg |
| Riffelsee | Matterhorn Riffelsee 2005-06-11.jpg | CC BY-SA 3.0, Dirk Beyer |
| Sellagruppe | Sella da Ciandepinëi.jpg | CC BY-SA 3.0, Wolfgang Moroder |
| Wanderweg Zermatt | CH.VS.Zermatt 2021-10-17 Matterhorn 8726.jpg | CC BY-SA 4.0, Roy Egloff |
| Chola-Tal | Mountains in snow, Mountain lake, Chola Valley, Nepal, Himalayas.jpg | CC BY 4.0, Vyacheslav Argenberg |
| „Tõus“, Kaukasus | Tõus 83.jpg | CC BY-SA 4.0, Jaan Künnap |

Die großen Originale (bis 48 MB) liegen nicht im Repository. Neu erzeugen der Webformate:
`PHOTO_SRC=<ordner mit den Originalen> node scripts/process-photos.mjs` (Download-URLs und
SHA-1 stehen in `photos/sources.json`).

## Lokal starten

```bash
npm install
npm run dev          # http://localhost:5173/mountenup/  (base kommt aus .env)
npm run build        # dist/
```

## Deployment (GitHub Pages)

`.env` setzt `VITE_BASE=/mountenup/` und die Seiten-URL. Veröffentlicht wird der Build über
den Branch `gh-pages` (das verwendete Token hat keinen `workflow`-Scope, daher kein
Actions-Workflow):

```bash
bash scripts/deploy-gh-pages.sh
```

`index.html` wird aus `scripts/index.template.html` erzeugt (`python3 scripts/build-index.py`,
`<picture>`-Markup aus `public/photos/manifest.json`).

Einschränkungen von GitHub Pages: kein Formular-Backend (deshalb Demo-Modus), keine eigenen
Cache-Header, `robots.txt` wirkt nur im Domain-Wurzelverzeichnis, GitHub protokolliert
Besucher-IP-Adressen (siehe Datenschutzerklärung, Abschnitt Hosting).

## Ordner

```
src/webgl/        climb.js – Berg, Route, Figur, Kamera (nur #aufstieg)
src/js/           Navigation, Preloader, Animationen, climb-story.js (Pin/Etappen), Formular
public/photos/    AVIF/WebP-Varianten + manifest.json
photos/           sources.json (Lizenzen, SHA-1, Download-URLs)
scripts/          Screenshots, Interaktionstests, Lighthouse/axe, Foto-Verarbeitung, Deploy
reports/          Messungen
screens/          Screenshots
```
