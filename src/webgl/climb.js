/**
 * "Der Aufstieg" – scroll-gesteuerte 3D-Szene (nur innerhalb von #aufstieg).
 *
 * Muster (Quellen im README):
 *  - Codrops "Cinematic 3D Scroll Experiences with GSAP" (2025-11-19): ein
 *    gepinnter Abschnitt, ScrollTrigger-Fortschritt treibt Proxy-Werte, die im
 *    Render-Loop auf Kamera/Objekte angewendet werden.
 *  - Codrops "Scroll-Driven 3D Gallery using a Blender Camera Path" (2026-07-07):
 *    CatmullRomCurve3 als Pfad, Position über einen normierten Wert t (0..1).
 *  - three.js Curve-Doku: getPointAt()/getTangentAt() liefern Punkte mit
 *    gleichmäßigem Abstand (Bogenlänge) – die Figur läuft deshalb gleichmäßig.
 *
 * Verhalten:
 *  - Kein Dauer-Loop: Es wird nur gerendert, solange sich der geglättete
 *    Fortschritt ändert (oder nach Resize). Steht der Scroll, steht das Bild.
 *  - Rendert nur, wenn der Abschnitt aktiv ist und der Tab sichtbar ist.
 *  - Pixel-Ratio gedeckelt (Desktop 1.75, Mobil 1.5).
 *  - Reduzierte Bewegung: kein Scrubbing, statisches Bild (Figur am Gipfel).
 */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, Fog, PlaneGeometry, Mesh, MeshStandardMaterial,
  MeshBasicMaterial, HemisphereLight, DirectionalLight, CatmullRomCurve3, Vector3, BufferGeometry,
  Line, LineDashedMaterial, Group, CapsuleGeometry, SphereGeometry, BoxGeometry, CylinderGeometry,
  ConeGeometry, TubeGeometry, Float32BufferAttribute, CanvasTexture, SRGBColorSpace, DoubleSide,
} from 'three';

/* ---------- Gelände ---------- */
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }
function ridged(x, y) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { s += a * (1 - Math.abs(vnoise(x * f, y * f) * 2 - 1)); f *= 2.1; a *= 0.5; } return s; }
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export function heightAt(x, z) {
  const r = Math.hypot(x * 1.05, z);
  const cone = Math.max(0, 1 - r / 10.5);
  // Pyramidenform mit Graten (Kantenverstärkung über |sin| des Winkels)
  const ang = Math.atan2(z, x);
  const ridges = 1 + 0.12 * (Math.abs(Math.sin(ang * 1.5 + 0.6)) - 0.5) * 2;
  let h = 7.0 * Math.pow(cone, 2.1) * ridges;
  h += 1.2 * (ridged(x * 0.2 + 3.1, z * 0.2 - 1.7) - 0.45) * Math.pow(cone, 0.9);
  h += 0.22 * (fbm(x * 0.6, z * 0.6) - 0.5);
  h += 2.1 * Math.exp(-((x - 5.4) ** 2 + (z + 2.8) ** 2) / 5);   // Nebengipfel rechts
  h += 1.5 * Math.exp(-((x + 6.0) ** 2 + (z + 3.4) ** 2) / 4);   // Nebengipfel links
  return Math.max(h, -0.2);
}

const COL = {
  valley: new Color('#1a2631'), rockLo: new Color('#33404c'), rockHi: new Color('#596674'),
  snow: new Color('#e6eef4'), snowShade: new Color('#b9c8d6'),
};

function buildTerrain(seg) {
  let geo = new PlaneGeometry(32, 32, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo = geo.toNonIndexed();
  geo.computeVertexNormals(); // nicht-indiziert => Flächennormalen (Low-Poly-Facetten)
  const p = geo.attributes.position, n = geo.attributes.normal;
  const colors = new Float32Array(p.count * 3);
  const c = new Color();
  for (let i = 0; i < p.count; i += 3) {
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const ny = n.getY(i);
    const jitter = (hash(x * 3.1, z * 2.7) - 0.5) * 0.03;
    const snowLine = 3.6 + (fbm(x * 0.5, z * 0.5) - 0.5) * 1.6;
    // weiche Übergänge statt harter Schwelle: weniger Treppenkanten an der Schneegrenze
    if (y < 0.6) c.copy(COL.valley).lerp(COL.rockLo, smooth(-0.2, 0.6, y));
    else c.copy(COL.rockLo).lerp(COL.rockHi, smooth(0.6, 5, y));
    const snowAmt = smooth(snowLine - 0.5, snowLine + 0.5, y) * smooth(0.4, 0.72, ny);
    if (snowAmt > 0) c.lerp(ny > 0.78 ? COL.snow : COL.snowShade, snowAmt);
    c.offsetHSL(0, 0, jitter);
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
  }
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const mat = new MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, // Route liegt sichtbar auf dem Gelände
  });
  return new Mesh(geo, mat);
}

/* ---------- Route: Serpentinen von vorn zum Gipfel ---------- */
function findSummit() {
  let best = { x: 0, z: 0, y: -Infinity };
  for (let x = -1.6; x <= 1.6; x += 0.1) for (let z = -1.6; z <= 1.6; z += 0.1) {
    const y = heightAt(x, z);
    if (y > best.y) best = { x, z, y };
  }
  return best;
}

function buildRoute(summit) {
  // letzte Punkte bewusst auf dem Grat (nicht in der Rinne), damit die Route in der Totale sichtbar bleibt
  const xz = [[-1.8, 9.4], [1.9, 7.6], [-1.3, 6.0], [1.7, 4.6], [-0.7, 3.3], [1.1, 2.3], [0.65, 1.2], [0.45, 0.5], [summit.x, summit.z]];
  const flat = new CatmullRomCurve3(xz.map(([x, z]) => new Vector3(x, 0, z)), false, 'catmullrom', 0.5);
  const pts = flat.getSpacedPoints(160).map((v) => new Vector3(v.x, heightAt(v.x, v.z) + 0.07, v.z));
  return new CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
}

/* ---------- Kletterfigur aus Grundkörpern ---------- */
function buildClimber() {
  const jacket = new MeshStandardMaterial({ color: '#e2603a', roughness: 0.7, flatShading: true });
  const pants = new MeshStandardMaterial({ color: '#25323f', roughness: 0.9, flatShading: true });
  const pack = new MeshStandardMaterial({ color: '#8f3a22', roughness: 0.8, flatShading: true });
  const skin = new MeshStandardMaterial({ color: '#e3bf9b', roughness: 0.8 });
  const helmet = new MeshStandardMaterial({ color: '#f3f6f8', roughness: 0.4 });
  const metal = new MeshStandardMaterial({ color: '#c9d2da', roughness: 0.3, metalness: 0.6 });

  const root = new Group();
  const body = new Group();
  root.add(body);

  const limb = (w, h, d, mat, px, py, pz) => {
    const pivot = new Group();
    pivot.position.set(px, py, pz);
    const r = Math.min(w, d) / 2;
    const m = new Mesh(new CapsuleGeometry(r, Math.max(0.001, h - 2 * r), 3, 8), mat);
    m.position.y = -h / 2;
    pivot.add(m);
    body.add(pivot);
    return pivot;
  };
  const legL = limb(0.042, 0.14, 0.046, pants, -0.028, 0.14, 0);
  const legR = limb(0.042, 0.14, 0.046, pants, 0.028, 0.14, 0);
  const torso = new Mesh(new CapsuleGeometry(0.05, 0.08, 4, 8), jacket);
  torso.position.y = 0.195;
  body.add(torso);
  const backpack = new Mesh(new BoxGeometry(0.08, 0.11, 0.05), pack);
  backpack.position.set(0, 0.205, -0.055);
  body.add(backpack);
  const head = new Mesh(new SphereGeometry(0.036, 12, 10), skin);
  head.position.y = 0.29;
  body.add(head);
  const cap = new Mesh(new SphereGeometry(0.041, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), helmet);
  cap.position.y = 0.295;
  body.add(cap);
  const armL = limb(0.03, 0.12, 0.03, jacket, -0.066, 0.24, 0);
  const armR = limb(0.03, 0.12, 0.03, jacket, 0.066, 0.24, 0);
  // Eispickel in der rechten Hand
  const axe = new Mesh(new CylinderGeometry(0.005, 0.005, 0.16, 6), metal);
  axe.position.set(0, -0.14, 0.03);
  axe.rotation.x = Math.PI / 2.6;
  armR.add(axe);
  const axeHead = new Mesh(new BoxGeometry(0.008, 0.012, 0.06), metal);
  axeHead.position.set(0, -0.17, 0.1);
  armR.add(axeHead);

  root.scale.setScalar(1.7);
  return { root, body, legL, legR, armL, armR };
}

function buildCamp(at) {
  const g = new Group();
  const tentMat = new MeshStandardMaterial({ color: '#d99a3d', roughness: 0.8, flatShading: true });
  [[-0.18, 0.05], [0.16, -0.08]].forEach(([dx, dz], i) => {
    const tent = new Mesh(new ConeGeometry(0.11, 0.12, 4), tentMat);
    tent.position.set(at.x + dx, heightAt(at.x + dx, at.z + dz) + 0.055, at.z + dz);
    tent.rotation.y = Math.PI / 4 + i * 0.4;
    g.add(tent);
  });
  return g;
}

function buildHut(at) {
  const g = new Group();
  const wall = new Mesh(new BoxGeometry(0.22, 0.12, 0.16), new MeshStandardMaterial({ color: '#7a5a3e', roughness: 0.9, flatShading: true }));
  const roof = new Mesh(new ConeGeometry(0.17, 0.1, 4), new MeshStandardMaterial({ color: '#2e3a45', roughness: 0.8, flatShading: true }));
  const y = heightAt(at.x + 0.3, at.z) + 0.04;
  wall.position.set(at.x + 0.3, y + 0.04, at.z);
  roof.position.set(at.x + 0.3, y + 0.15, at.z);
  roof.rotation.y = Math.PI / 4;
  g.add(wall, roof);
  return g;
}

function buildFlag(at) {
  const g = new Group();
  const pole = new Mesh(new CylinderGeometry(0.006, 0.006, 0.36, 6), new MeshStandardMaterial({ color: '#dfe6ec' }));
  pole.position.y = 0.18;
  const cloth = new Mesh(new PlaneGeometry(0.17, 0.1), new MeshBasicMaterial({ color: '#9fd3f5', side: DoubleSide }));
  cloth.position.set(0.09, 0.31, 0);
  g.add(pole, cloth);
  g.position.set(at.x + 0.12, at.y - 0.05, at.z - 0.06);
  g.scale.setScalar(0.001);
  return g;
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#0b1219');
  g.addColorStop(0.5, '#172640');
  g.addColorStop(0.78, '#46506c');
  g.addColorStop(0.92, '#9a7a7c');
  g.addColorStop(1, '#c99a86');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/* ---------- Öffentliche API ---------- */
export function createClimb(canvas, { reducedMotion = false, isMobile = false, onAltitude } = {}) {
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: !isMobile, alpha: false, powerPreference: 'high-performance' });
  } catch (e) {
    return null;
  }
  const maxDpr = isMobile ? 1.5 : 1.75;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  scene.background = skyTexture();
  scene.fog = new Fog('#48506a', 16, 44);

  const camera = new PerspectiveCamera(isMobile ? 52 : 40, 1, 0.05, 120);

  scene.add(new HemisphereLight('#a9bfd6', '#0b1219', 1.1));
  const sun = new DirectionalLight('#ffe7cf', 2.2);
  const sunCold = new Color('#a9bcd8'), sunWarm = new Color('#ffcf9e');
  sun.position.set(-9, 12, 7);
  scene.add(sun);

  scene.add(buildTerrain(isMobile ? 110 : 150));

  const summit = findSummit();
  const route = buildRoute(summit);
  const base = route.getPointAt(0);
  const top = route.getPointAt(1);

  // Gesamte Route: gestrichelt; gegangener Teil: feine Röhre in Gletschereis
  const dashedGeo = new BufferGeometry().setFromPoints(route.getSpacedPoints(400));
  const dashed = new Line(dashedGeo, new LineDashedMaterial({ color: '#eef3f7', dashSize: 0.09, gapSize: 0.07, transparent: true, opacity: 0.5 }));
  dashed.computeLineDistances();
  scene.add(dashed);
  const TUBE_SEG = 400, RAD_SEG = 5;
  const trailGeo = new TubeGeometry(route, TUBE_SEG, 0.014, RAD_SEG, false);
  const trail = new Mesh(trailGeo, new MeshBasicMaterial({ color: '#9fd3f5' }));
  trailGeo.setDrawRange(0, 0);
  scene.add(trail);

  scene.add(buildCamp(base));
  scene.add(buildHut(route.getPointAt(0.42)));
  const flag = buildFlag(top);
  scene.add(flag);

  const climber = buildClimber();
  scene.add(climber.root);

  // Zustand
  const state = { target: reducedMotion ? 1 : 0, p: reducedMotion ? 1 : 0, active: !!reducedMotion, hidden: document.hidden, dirty: true, phase: 0, yaw: 0, facing: 1, frames: 0 };
  const tmpP = new Vector3(), tmpT = new Vector3(), camPos = new Vector3(), look = new Vector3(), wideLook = new Vector3(0, 4.2, 0);

  // Fortschritt -> Routenparameter: Mischung aus Weglänge und Höhengewinn, damit
  // die Höhe gleichmäßiger wächst (die Route wird oben steiler).
  const N = 240, lut = new Float32Array(N + 1);
  {
    let rise = 0, prevY = base.y;
    const rises = [0];
    for (let i = 1; i <= N; i++) { const y = route.getPointAt(i / N).y; rise += Math.max(0, y - prevY); prevY = y; rises.push(rise); }
    for (let i = 0; i <= N; i++) lut[i] = 0.5 * (i / N) + 0.5 * (rises[i] / rise);
  }
  const progressToU = (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let lo = 0, hi = N;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (lut[mid] < p) lo = mid; else hi = mid; }
    const f = (p - lut[lo]) / Math.max(1e-6, lut[hi] - lut[lo]);
    return (lo + f) / N;
  };

  const altitudeAt = (y) => Math.round(2150 + ((y - base.y) / (top.y - base.y)) * (4164 - 2150));

  function pose(u, dp) {
    route.getPointAt(u, tmpP);
    route.getTangentAt(Math.min(u, 0.999), tmpT);
    climber.root.position.copy(tmpP).y -= 0.07;
    // Blickrichtung: bergauf beim Runterscrollen, bergab beim Hochscrollen
    if (Math.abs(dp) > 1e-5) state.facing = dp > 0 ? 1 : -1;
    const yawTarget = Math.atan2(tmpT.x, tmpT.z) + (state.facing < 0 ? Math.PI : 0);
    let d = yawTarget - state.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    state.yaw += d * (reducedMotion ? 1 : 0.25);
    climber.root.rotation.y = state.yaw;
    // Schrittbewegung hängt an der gegangenen Strecke, nicht an der Zeit
    state.phase += Math.abs(dp) * route.getLength() * 52;
    const atTop = smooth(0.97, 1, u);
    const swing = Math.sin(state.phase) * 0.6 * (1 - atTop);
    climber.legL.rotation.x = swing;
    climber.legR.rotation.x = -swing;
    climber.armL.rotation.x = -swing * 0.8 - atTop * 2.6; // am Gipfel: Arm hoch
    climber.armR.rotation.x = swing * 0.8;
    climber.body.rotation.x = Math.max(0, tmpT.y) * 0.5 * state.facing * (1 - atTop);
    climber.body.position.y = Math.abs(Math.sin(state.phase)) * 0.008;
    flag.scale.setScalar(Math.max(0.001, smooth(0.94, 1, u)));
    // Licht: von kalter Dämmerung zu warmem Morgenlicht, je höher die Figur steigt
    sun.color.copy(sunCold).lerp(sunWarm, smooth(0.1, 0.95, u));
    sun.intensity = lerp(1.5, 2.6, u);
    trailGeo.setDrawRange(0, Math.floor(u * TUBE_SEG) * RAD_SEG * 6);
    return tmpP;
  }

  function frameCamera(u, p) {
    // Totale -> Verfolgung -> Gipfel-Totale (Gewichte über smoothstep)
    const wide = 1 - smooth(0, 0.16, u) + smooth(0.84, 1, u);
    const az = lerp(0.95 - 1.25 * u, 0.32, wide);
    const el = lerp(0.36, 0.3, wide);
    const dist = lerp(isMobile ? 4.4 : 3.6, isMobile ? 22 : 17, wide);
    look.set(p.x, p.y + 0.18, p.z).lerp(wideLook, wide);
    camPos.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist).add(look);
    const ground = heightAt(camPos.x, camPos.z) + 0.35;
    if (camPos.y < ground) camPos.y = ground;
    camera.position.copy(camPos);
    camera.lookAt(look);
  }

  let lastAlt = -1;
  function render(dp) {
    const u = progressToU(state.p);
    const p = pose(u, dp);
    frameCamera(u, p);
    renderer.render(scene, camera);
    state.frames++;
    canvas.dataset.frames = String(state.frames);
    const alt = altitudeAt(p.y);
    if (alt !== lastAlt) { lastAlt = alt; onAltitude?.(alt, state.p); }
  }

  function measure() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    state.dirty = true;
  }

  /** Wird vom GSAP-Ticker aufgerufen; rendert nur bei Änderung. */
  function tick(dt) {
    if (!state.active || state.hidden) return;
    const diff = state.target - state.p;
    if (Math.abs(diff) < 1e-4 && !state.dirty) return;
    const prev = state.p;
    state.p = Math.abs(diff) < 1e-4 ? state.target : state.p + diff * (1 - Math.exp(-Math.min(dt, 0.1) * 7));
    state.dirty = false;
    render(state.p - prev);
  }

  const onVisibility = () => { state.hidden = document.hidden; if (!state.hidden) state.dirty = true; };
  document.addEventListener('visibilitychange', onVisibility);
  const ro = new ResizeObserver(() => measure());
  ro.observe(canvas);

  measure();
  render(0);

  return {
    renderer,
    tick,
    measure,
    setProgress(u) { if (!reducedMotion) state.target = Math.min(1, Math.max(0, u)); },
    setActive(on) { state.active = on || reducedMotion; if (on) state.dirty = true; },
    getState: () => ({ p: state.p, target: state.target, active: state.active, hidden: state.hidden, frames: state.frames, climber: climber.root.position.toArray() }),
    // Shader asynchron kompilieren, wenn KHR_parallel_shader_compile vorhanden ist (sonst ohne Warnung überspringen)
    warmup: () => (renderer.extensions.has('KHR_parallel_shader_compile') ? renderer.compileAsync(scene, camera).catch(() => {}) : Promise.resolve()),
    dispose() { ro.disconnect(); document.removeEventListener('visibilitychange', onVisibility); renderer.dispose(); },
  };
}
