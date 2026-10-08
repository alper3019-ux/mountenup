/**
 * "Der Aufstieg" – scroll-gesteuerte 3D-Szene (nur innerhalb von #aufstieg).
 *
 * Quellen (im README verlinkt):
 *  - Codrops "Cinematic 3D Scroll Experiences with GSAP" (2025-11-19): gepinnter Abschnitt,
 *    Scroll-Fortschritt treibt Proxy-Werte, die im Render-Loop angewendet werden.
 *  - three.js Curve-Doku: getPointAt()/getTangentAt() mit gleichmäßigem Abstand.
 *  - three.js TerrainGenerator (Doku + examples/jsm/generators/TerrainGenerator.js, r186):
 *    gradientengedämpftes Rauschen, thermische Erosion gegen Nadelspitzen, Schattierung nach
 *    Höhe/Hangneigung mit Gesteinsbänderung, Schneeflecken, Mulden-Abdunklung und
 *    Welt-Raum-Bump-Normalen. Hier für WebGLRenderer nachgebaut (onBeforeCompile statt TSL).
 *
 * Verhalten:
 *  - Kein Dauer-Loop: gerendert wird nur, wenn sich der geglättete Fortschritt ändert
 *    (oder nach Resize). Auch die Schneeflocken hängen am Scroll, nicht an der Zeit.
 *  - Rendert nur, wenn der Abschnitt aktiv und der Tab sichtbar ist.
 *  - Pixel-Ratio gedeckelt (Desktop 1.75, Mobil 1.5).
 *  - Reduzierte Bewegung: kein Scrubbing, ein statisches Bild (Figur am Gipfel).
 */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, Fog, Mesh, MeshStandardMaterial, ShaderMaterial,
  HemisphereLight, DirectionalLight, CatmullRomCurve3, Vector3, BufferGeometry, Group, CapsuleGeometry,
  SphereGeometry, BoxGeometry, CylinderGeometry, TorusGeometry, IcosahedronGeometry, PlaneGeometry,
  ExtrudeGeometry, Shape, Float32BufferAttribute, BufferAttribute, CanvasTexture, SRGBColorSpace,
  DoubleSide, BackSide, AdditiveBlending, Points, InstancedMesh, Object3D, MeshBasicMaterial,
  PCFShadowMap, ACESFilmicToneMapping, Quaternion,
} from 'three';

/* ======================================================================
   Rauschen + Höhenfeld (CPU)
   ====================================================================== */
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }
/** Gradientengedämpfte Fraktalsumme (nach three.js TerrainGenerator): steile Oktaven werden
 *  abgeschwächt -> klare Grate, ruhige Mulden. Domäne rotiert pro Oktave um ~37°. */
function eroded(x, z) {
  let sum = 0, amp = 1, dX = 0, dZ = 0, px = x, pz = z, freq = 1, norm = 0;
  const e = 0.01;
  for (let i = 0; i < 5; i++) {
    const bx = px * freq + i * 17.3, bz = pz * freq - i * 9.1;
    const n = vnoise(bx, bz) * 2 - 1;
    dX += ((vnoise(bx + e, bz) * 2 - 1) - n) / e * freq;
    dZ += ((vnoise(bx, bz + e) * 2 - 1) - n) / e * freq;
    sum += amp * n / (1 + 0.7 * (dX * dX + dZ * dZ));
    norm += amp;
    const rx = 0.8 * px - 0.6 * pz; pz = 0.6 * px + 0.8 * pz; px = rx;
    freq *= 2; amp *= 0.5;
  }
  return (sum / norm) * 0.5 + 0.5;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

function massif(x, z) {
  const r = Math.hypot(x * 1.05, z);
  const rs = Math.sqrt(r * r + 0.81) - 0.9; // weich gerundeter Gipfel statt Spitze
  const cone = Math.max(0, 1 - rs / 10.5);
  const ang = Math.atan2(z, x);
  const ridges = 1 + 0.14 * smooth(0.6, 2.8, r) * (Math.abs(Math.sin(ang * 1.5 + 0.6)) * 2 - 1);
  let h = 7.0 * Math.pow(cone, 2.0) * ridges;
  h += 1.3 * (eroded(x * 0.16 + 3.1, z * 0.16 - 1.7) - 0.45) * Math.pow(cone, 0.8) * smooth(0.3, 1.8, r);
  h += 0.22 * (fbm(x * 0.55, z * 0.55) - 0.5);
  h += 2.1 * Math.exp(-((x - 5.4) ** 2 + (z + 2.8) ** 2) / 5);
  h += 1.5 * Math.exp(-((x + 6.0) ** 2 + (z + 3.4) ** 2) / 4);
  return Math.max(h, -0.25);
}

/** Thermische Erosion (Talus) auf dem Raster – baut Überhänge/Nadeln ab (TerrainGenerator). */
function thermalErode(h, N, cell, talus, passes) {
  const drop = talus * cell, delta = new Float32Array(N * N), ex = [0, 0, 0, 0], off = [-1, 1, -N, N];
  for (let p = 0; p < passes; p++) {
    delta.fill(0);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x, hi = h[i];
      ex[0] = x > 0 ? hi - h[i - 1] - drop : 0; ex[1] = x < N - 1 ? hi - h[i + 1] - drop : 0;
      ex[2] = z > 0 ? hi - h[i - N] - drop : 0; ex[3] = z < N - 1 ? hi - h[i + N] - drop : 0;
      let sum = 0, peak = 0;
      for (let k = 0; k < 4; k++) { if (ex[k] <= 0) { ex[k] = 0; continue; } sum += ex[k]; if (ex[k] > peak) peak = ex[k]; }
      if (sum <= 0) continue;
      const move = 0.5 * peak;
      delta[i] -= move;
      for (let k = 0; k < 4; k++) if (ex[k] > 0) delta[i + off[k]] += move * ex[k] / sum;
    }
    for (let k = 0; k < N * N; k++) h[k] += delta[k];
  }
}

const yieldFrame = () => new Promise((r) => setTimeout(r, 0));
// Zeitbudget: lange Rechenschleifen geben spätestens alle ~8 ms den Main-Thread frei
let sliceStart = 0;
const maybeYield = async () => {
  const now = performance.now();
  if (now - sliceStart > 8) { await yieldFrame(); sliceStart = performance.now(); }
};

/* ======================================================================
   Gelände-Material: MeshStandardMaterial + eigene Farb-/Bump-Logik
   ====================================================================== */
const NOISE_GLSL = /* glsl */`
  float mu_hash(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float mu_noise(vec3 p){
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(mu_hash(i), mu_hash(i + vec3(1,0,0)), f.x), mix(mu_hash(i + vec3(0,1,0)), mu_hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(mu_hash(i + vec3(0,0,1)), mu_hash(i + vec3(1,0,1)), f.x), mix(mu_hash(i + vec3(0,1,1)), mu_hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
`;

function terrainMaterial(maxH) {
  const u = {
    uRock: { value: new Color('#5d5a57') }, uRock2: { value: new Color('#7b756e') }, uScree: { value: new Color('#8a8279') },
    uValley: { value: new Color('#2b2f33') }, uSnow: { value: new Color('#eef2f6') }, uSnowDeep: { value: new Color('#c3cfdc') },
    uTrailRock: { value: new Color('#3e3934') }, uTrailSnow: { value: new Color('#a9b3bf') }, uMaxH: { value: maxH },
  };
  const mat = new MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aTrail; attribute float aAO;
        varying float vTrail; varying float vAO; varying vec3 vWPos; varying vec3 vWNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vTrail = aTrail; vAO = aAO;
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uRock, uRock2, uScree, uValley, uSnow, uSnowDeep, uTrailRock, uTrailSnow; uniform float uMaxH;
        varying float vTrail; varying float vAO; varying vec3 vWPos; varying vec3 vWNormal;
        float muSnowMask;
        ${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float alt = clamp(vWPos.y / uMaxH, 0.0, 1.0);
          float flat_ = clamp(vWNormal.y, 0.0, 1.0);
          float steep = 1.0 - flat_;
          float detail = mu_noise(vec3(vWPos.xz * 1.5, 1.7));
          float grain  = mu_noise(vec3(vWPos.xz * 5.4, 4.1));
          float macro  = mu_noise(vec3(vWPos.xz * 0.36, 8.3));
          float fine   = mu_noise(vWPos * 22.0);
          // Gesteinsbänderung: zwei Frequenzen, von Rauschen verbogen
          float bandA = sin(vWPos.y * 9.0 + vWPos.x * 3.1 - vWPos.z * 2.2 + detail * 6.0 + macro * 5.0);
          float bandB = sin(vWPos.y * 23.0 + grain * 5.0 + fine * 2.0);
          float strata = (bandA * 0.7 + bandB * 0.3) * 0.5 + 0.5;
          vec3 rock = mix(uRock, uRock2, strata * 0.35) * (strata * 0.1 + 0.92) * (grain * 0.14 + 0.93) * (fine * 0.16 + 0.92);
          vec3 col = mix(uValley, rock, smoothstep(0.0, 0.22, alt));
          float scree = smoothstep(0.35, 0.65, steep) * smoothstep(0.35, 0.7, flat_) * (detail * 0.5 + 0.5);
          col = mix(col, uScree, scree * 0.45);
          // Schnee auf hohem, flachem Gelände; Rauschen bricht die Schneegrenze auf
          // klare Kanten: schmale Übergänge, vom feinen Rauschen aufgebrochen
          float snowAlt = smoothstep(0.44, 0.5, alt + (detail - 0.5) * 0.22 + (grain - 0.5) * 0.08 + (fine - 0.5) * 0.03);
          float snowFlat = smoothstep(0.76, 0.82, flat_ + (grain - 0.5) * 0.12 + (fine - 0.5) * 0.04);
          muSnowMask = snowAlt * snowFlat;
          vec3 snow = mix(uSnow, uSnowDeep, smoothstep(0.2, 0.75, grain) * 0.5) * (fine * 0.05 + 0.975);
          col = mix(col, snow, muSnowMask);
          // Pfad: festgetretener Schnee bzw. dunkler Fels
          col = mix(col, mix(uTrailRock, uTrailSnow, muSnowMask), vTrail * 0.8);
          // Mulden abdunkeln (vorberechnete Okklusion) + leichte Makro-/Kornvariation
          col *= mix(0.5, 1.0, vAO);
          col *= (macro * 0.5 + 0.5) * 0.12 + 0.94;
          diffuseColor.rgb = col;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.95, 0.68, muSnowMask);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // Welt-Raum-Bump (Mikkelsen-Surface-Gradient), in der Ferne ausgeblendet
          float dist = length(vViewPosition);
          float fade = smoothstep(22.0, 3.0, dist);
          if (fade > 0.01) {
            float steepN = 1.0 - clamp(vWNormal.y, 0.0, 1.0);
            float relief = mu_noise(vWPos * 6.0) + 0.5 * mu_noise(vWPos * 17.0) + 0.25 * mu_noise(vWPos * 45.0);
            float strength = mix(mix(0.014, 0.034, steepN), 0.005, muSnowMask) * fade;
            vec3 pos = -vViewPosition;
            vec3 dpdx = dFdx(pos), dpdy = dFdy(pos);
            vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
            float det = dot(dpdx, r1);
            vec3 grad = sign(det) * (dFdx(relief) * r1 + dFdy(relief) * r2);
            normal = normalize(abs(det) * normal - grad * strength);
          }
        }`);
  };
  return mat;
}

/* ======================================================================
   Gelände bauen (asynchron in Etappen, damit der Main-Thread frei bleibt)
   ====================================================================== */
const SIZE = 32;
const ROUTE_XZ = [[-1.8, 9.4], [1.9, 7.6], [-1.3, 6.0], [1.7, 4.6], [-0.7, 3.3], [1.1, 2.3], [0.65, 1.2], [0.4, 0.45], [0, 0]];

async function buildTerrain(seg) {
  const N = seg + 1, cell = SIZE / seg, half = SIZE / 2;
  const H = new Float32Array(N * N);
  sliceStart = performance.now();
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) H[iz * N + ix] = massif(-half + ix * cell, -half + iz * cell);
    await maybeYield();
  }
  for (let pass = 0; pass < 6; pass++) { thermalErode(H, N, cell, 1.5, 1); await maybeYield(); }

  const idx = (x, z) => {
    const gx = Math.min(N - 2, Math.max(0, (x + half) / cell)), gz = Math.min(N - 2, Math.max(0, (z + half) / cell));
    return [Math.floor(gx), Math.floor(gz), gx - Math.floor(gx), gz - Math.floor(gz)];
  };
  const sample = (x, z) => {
    const [ix, iz, fx, fz] = idx(x, z), i = iz * N + ix;
    return lerp(lerp(H[i], H[i + 1], fx), lerp(H[i + N], H[i + N + 1], fx), fz);
  };
  const stamp = (cx, cz, radius, fn) => {
    const x0 = Math.max(0, Math.floor((cx - radius + half) / cell)), x1 = Math.min(N - 1, Math.ceil((cx + radius + half) / cell));
    const z0 = Math.max(0, Math.floor((cz - radius + half) / cell)), z1 = Math.min(N - 1, Math.ceil((cz + radius + half) / cell));
    for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
      const d = Math.hypot(-half + ix * cell - cx, -half + iz * cell - cz);
      if (d <= radius) fn(iz * N + ix, d);
    }
  };

  // Gipfelplateau: höchsten Punkt im Zentrum suchen und eine kleine, flache Kuppe formen
  let best = { i: 0, h: -Infinity };
  stamp(0, 0, 2, (i) => { if (H[i] > best.h) best = { i, h: H[i] }; });
  const sx = -half + (best.i % N) * cell, sz = -half + Math.floor(best.i / N) * cell;
  const plateauH = best.h - 0.12;
  stamp(sx, sz, 1.1, (i, d) => { const w = smooth(1.05, 0.4, d); H[i] = lerp(H[i], plateauH + (H[i] - plateauH) * 0.15, w); });
  ROUTE_XZ[ROUTE_XZ.length - 1] = [sx, sz];

  // Route in der Ebene; Terrassen für Lager + Hütte; Pfad einkerben
  const flat = new CatmullRomCurve3(ROUTE_XZ.map(([x, z]) => new Vector3(x, 0, z)), false, 'catmullrom', 0.5);
  const terrace = (x, z, r) => { const h0 = sample(x, z); stamp(x, z, r, (i, d) => { H[i] = lerp(H[i], h0, smooth(r, r * 0.45, d)); }); };
  const p0 = flat.getPointAt(0), t0 = flat.getTangentAt(0);
  const campAt = new Vector3(p0.x - t0.z * 0.45, 0, p0.z + t0.x * 0.45);
  const hp = flat.getPointAt(0.42), ht = flat.getTangentAt(0.42);
  const hutAt = new Vector3(hp.x + ht.z * 0.42, 0, hp.z - ht.x * 0.42);
  terrace(campAt.x, campAt.z, 0.55);
  terrace(hutAt.x, hutAt.z, 0.4);
  const trail = new Float32Array(N * N), carve = new Float32Array(N * N);
  const R = 0.13;
  for (const p of flat.getSpacedPoints(900)) {
    stamp(p.x, p.z, R, (i, d) => { const m = smooth(R, R * 0.3, d); if (m > trail[i]) trail[i] = m; if (m > carve[i]) carve[i] = m; });
  }
  for (let i = 0; i < N * N; i++) H[i] -= carve[i] * 0.025;
  await yieldFrame();

  // Normalen (zentrale Differenzen) + Mulden-Okklusion (Höhe vs. geglättete Umgebung)
  const pos = new Float32Array(N * N * 3), nor = new Float32Array(N * N * 3), ao = new Float32Array(N * N);
  const blur = new Float32Array(H), tmp = new Float32Array(N * N), K = 4;
  for (let pass = 0; pass < 2; pass++) {
    const src = pass === 0 ? H : tmp, dst = pass === 0 ? tmp : blur;
    for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
      let s = 0, c = 0;
      for (let k = -K; k <= K; k++) {
        const jx = pass === 0 ? ix + k : ix, jz = pass === 0 ? iz : iz + k;
        if (jx < 0 || jz < 0 || jx >= N || jz >= N) continue;
        s += src[jz * N + jx]; c++;
      }
      dst[iz * N + ix] = s / c;
    }
    await maybeYield();
  }
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
    const i = iz * N + ix;
    const hL = H[iz * N + Math.max(0, ix - 1)], hR = H[iz * N + Math.min(N - 1, ix + 1)];
    const hD = H[Math.max(0, iz - 1) * N + ix], hU = H[Math.min(N - 1, iz + 1) * N + ix];
    const nx = -(hR - hL) / (2 * cell), nz = -(hU - hD) / (2 * cell), l = Math.hypot(nx, 1, nz);
    pos.set([-half + ix * cell, H[i], -half + iz * cell], i * 3);
    nor.set([nx / l, 1 / l, nz / l], i * 3);
    ao[i] = Math.min(1, Math.max(0.4, 1 - Math.max(0, blur[i] - H[i]) * 1.8)) * (1 - trail[i] * 0.12);
    if (ix === N - 1) await maybeYield();
  }
  const index = new Uint32Array(seg * seg * 6);
  let k = 0;
  for (let iz = 0; iz < seg; iz++) for (let ix = 0; ix < seg; ix++) {
    const a = iz * N + ix, b = a + 1, c = a + N, d = c + 1;
    index[k++] = a; index[k++] = c; index[k++] = b; index[k++] = b; index[k++] = c; index[k++] = d;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('normal', new BufferAttribute(nor, 3));
  geo.setAttribute('aTrail', new BufferAttribute(trail, 1));
  geo.setAttribute('aAO', new BufferAttribute(ao, 1));
  geo.setIndex(new BufferAttribute(index, 1));
  geo.computeBoundingSphere();
  const mesh = new Mesh(geo, terrainMaterial(best.h));
  mesh.receiveShadow = true;
  const normalAt = (x, z, out = new Vector3()) => {
    const e = cell;
    return out.set(-(sample(x + e, z) - sample(x - e, z)) / (2 * e), 1, -(sample(x, z + e) - sample(x, z - e)) / (2 * e)).normalize();
  };
  return { mesh, sample, normalAt, flat, campAt, hutAt, summit: new Vector3(sx, plateauH, sz), maxH: best.h };
}

/* ======================================================================
   Figur, Hütte, Lager, Gipfel
   ====================================================================== */
function std(color, roughness = 0.8, extra = {}) { return new MeshStandardMaterial({ color, roughness, metalness: 0, ...extra }); }
function shadowed(o) { o.traverse((m) => { if (m.isMesh) m.castShadow = true; }); return o; }

function buildClimber() {
  const jacket = std('#e2582c', 0.62), jacketDark = std('#b8431f', 0.7), pants = std('#2b333d', 0.85);
  const boots = std('#3a2a22', 0.7), skin = std('#d9ad88', 0.75), helmetM = std('#f4f6f7', 0.32);
  const packM = std('#22405f', 0.75), matM = std('#c9b27a', 0.8), ropeM = std('#e7c84a', 0.7);
  const steel = std('#c6ced6', 0.35, { metalness: 0.35 }), shaftM = std('#2a3b52', 0.5), lamp = std('#fff1c9', 0.4, { emissive: '#ffd890', emissiveIntensity: 1.2 });

  const root = new Group(), body = new Group();
  root.add(body);
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const pivot = (parent, x, y, z) => { const g = new Group(); g.position.set(x, y, z); parent.add(g); return g; };

  // Beine: Oberschenkel + Unterschenkel mit Knie, Stiefel
  const legs = [-1, 1].map((s) => {
    const hip = pivot(body, s * 0.024, 0.155, 0);
    add(hip, new CapsuleGeometry(0.019, 0.045, 4, 10), pants, 0, -0.038, 0);
    const knee = pivot(hip, 0, -0.078, 0);
    add(knee, new CapsuleGeometry(0.016, 0.045, 4, 10), pants, 0, -0.036, 0);
    add(knee, new BoxGeometry(0.032, 0.026, 0.056), boots, 0, -0.072, 0.009);
    return { hip, knee };
  });
  // Rumpf, Gurt, Kragen
  const torso = add(body, new CapsuleGeometry(0.041, 0.07, 6, 14), jacket, 0, 0.215, 0);
  torso.scale.set(1, 1, 0.82);
  add(body, new CylinderGeometry(0.043, 0.043, 0.012, 16), pants, 0, 0.168, 0);
  add(body, new CylinderGeometry(0.026, 0.032, 0.022, 14), jacketDark, 0, 0.268, 0);
  // Rucksack mit Deckel, Isomatte und Seil
  add(body, new BoxGeometry(0.07, 0.095, 0.046), packM, 0, 0.222, -0.052);
  add(body, new BoxGeometry(0.072, 0.02, 0.05), packM, 0, 0.273, -0.05).rotation.x = 0.12;
  add(body, new CylinderGeometry(0.015, 0.015, 0.082, 12), matM, 0, 0.293, -0.05).rotation.z = Math.PI / 2;
  add(body, new BoxGeometry(0.05, 0.05, 0.012), packM, 0, 0.205, -0.079); // Außentasche
  add(body, new CylinderGeometry(0.006, 0.006, 0.09, 6), ropeM, 0.03, 0.2, -0.074); // Seitenriemen
  // Kopf, Helm mit Schild, Stirnlampe
  add(body, new SphereGeometry(0.031, 16, 12), skin, 0, 0.302, 0.004);
  const helmet = add(body, new SphereGeometry(0.036, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), helmetM, 0, 0.306, 0);
  helmet.scale.set(1, 0.9, 1.05);
  add(body, new BoxGeometry(0.014, 0.008, 0.008), lamp, 0, 0.318, 0.036);
  // Arme: Ober-/Unterarm, Handschuh; Pickel in der rechten Hand
  const arms = [-1, 1].map((s) => {
    const sh = pivot(body, s * 0.052, 0.255, 0);
    add(sh, new CapsuleGeometry(0.0135, 0.04, 4, 10), jacket, 0, -0.03, 0);
    const el = pivot(sh, 0, -0.062, 0);
    add(el, new CapsuleGeometry(0.0125, 0.036, 4, 10), jacket, 0, -0.026, 0);
    add(el, new SphereGeometry(0.014, 10, 8), pants, 0, -0.054, 0);
    return { sh, el };
  });
  const axe = new Group();
  axe.position.set(0, -0.056, 0);
  axe.rotation.x = 1.25;
  add(axe, new CylinderGeometry(0.0042, 0.0048, 0.17, 8), shaftM, 0, -0.06, 0);
  add(axe, new CylinderGeometry(0.0022, 0.0042, 0.02, 8), steel, 0, -0.152, 0); // Spitze
  const head = new Group(); head.position.set(0, 0.03, 0); axe.add(head);
  const pick = add(head, new BoxGeometry(0.006, 0.01, 0.05), steel, 0, 0, 0.022); pick.rotation.x = 0.18;
  add(head, new BoxGeometry(0.006, 0.008, 0.03), steel, 0, 0, -0.016).scale.set(1, 1.4, 1);
  arms[1].el.add(axe);

  root.scale.setScalar(1.6);
  shadowed(root);
  return { root, body, legs, arms };
}

function gableHut() {
  const g = new Group();
  const stone = std('#77736d', 0.95), wood = std('#6e4d33', 0.85), roofM = std('#3a4048', 0.7), snowM = std('#eef2f6', 0.6);
  const win = std('#ffcf8a', 0.5, { emissive: '#ffb45a', emissiveIntensity: 1.4 }), door = std('#3a281b', 0.9);
  const W = 0.34, D = 0.24;
  const base = new Mesh(new BoxGeometry(W + 0.03, 0.05, D + 0.03), stone); base.position.y = 0.025; g.add(base);
  const walls = new Mesh(new BoxGeometry(W, 0.13, D), wood); walls.position.y = 0.115; g.add(walls);
  const prism = (w, h, depth, mat, y, over = 0) => {
    const s = new Shape(); s.moveTo(-w / 2 - over, 0); s.lineTo(0, h); s.lineTo(w / 2 + over, 0); s.lineTo(-w / 2 - over, 0);
    const geo = new ExtrudeGeometry(s, { depth, bevelEnabled: false }); geo.translate(0, 0, -depth / 2);
    const m = new Mesh(geo, mat); m.position.y = y; m.rotation.y = Math.PI / 2; return m;
  };
  g.add(prism(D, 0.15, W + 0.06, roofM, 0.18, 0.035));
  const cap = prism(D * 0.45, 0.075, W + 0.05, snowM, 0.256, 0.0); g.add(cap);
  const chimney = new Mesh(new BoxGeometry(0.03, 0.08, 0.03), stone); chimney.position.set(0.09, 0.3, 0.05); g.add(chimney);
  [[-0.08, 0.12, D / 2 + 0.001], [0.06, 0.12, D / 2 + 0.001]].forEach(([x, y, z]) => { const w = new Mesh(new PlaneGeometry(0.04, 0.035), win); w.position.set(x, y, z); g.add(w); });
  const wSide = new Mesh(new PlaneGeometry(0.04, 0.035), win); wSide.position.set(W / 2 + 0.001, 0.12, 0); wSide.rotation.y = Math.PI / 2; g.add(wSide);
  const d = new Mesh(new PlaneGeometry(0.045, 0.08), door); d.position.set(-0.01, 0.09, D / 2 + 0.002); d.position.x = 0.13; g.add(d);
  return shadowed(g);
}

function domeTent(color) {
  const g = new Group();
  const shell = new Mesh(new SphereGeometry(0.09, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(color, 0.7, { emissive: color, emissiveIntensity: 0.18 }));
  shell.scale.set(1, 0.72, 1.35); g.add(shell);
  const pole = std('#2a2f36', 0.6);
  [0.6, -0.6].forEach((a) => { const t = new Mesh(new TorusGeometry(0.09, 0.0025, 4, 24, Math.PI), pole); t.rotation.set(0, a, 0); t.scale.set(1, 0.72, 1); g.add(t); });
  return shadowed(g);
}

function summitSet() {
  const g = new Group();
  const woodM = std('#4a3626', 0.85), stone = std('#6f6b66', 0.95);
  const cross = new Group();
  const v = new Mesh(new BoxGeometry(0.02, 0.44, 0.02), woodM); v.position.y = 0.22; cross.add(v);
  const h = new Mesh(new BoxGeometry(0.2, 0.02, 0.02), woodM); h.position.y = 0.32; cross.add(h);
  cross.position.set(-0.32, 0, -0.18); cross.rotation.y = 0.5; g.add(cross);
  [[0.07, 0], [0.055, 0.06], [0.04, 0.11], [0.026, 0.15]].forEach(([r, y], i) => {
    const s = new Mesh(new IcosahedronGeometry(r, 1), stone); s.scale.set(1, 0.6, 1); s.position.set(0.3, y + 0.02, -0.12); s.rotation.y = i; g.add(s);
  });
  return shadowed(g);
}

function flag() {
  const g = new Group();
  const pole = new Mesh(new CylinderGeometry(0.005, 0.005, 0.36, 8), std('#dfe6ec', 0.4)); pole.position.y = 0.18; g.add(pole);
  const geo = new PlaneGeometry(0.17, 0.105, 10, 3); geo.translate(0.085, 0, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(x * 34) * 0.01 * (x / 0.17)); }
  geo.computeVertexNormals();
  const cloth = new Mesh(geo, std('#9fd3f5', 0.6, { side: DoubleSide })); cloth.position.y = 0.3; g.add(cloth);
  return shadowed(g);
}

/* ======================================================================
   Atmosphäre: Himmel, ferne Grate, Schnee, Pfad-Leuchtband
   ====================================================================== */
function skyDome() {
  const mat = new ShaderMaterial({
    side: BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new Color() }, uMid: { value: new Color() }, uHorizon: { value: new Color() }, uSunDir: { value: new Vector3() }, uSunColor: { value: new Color() }, uWarm: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uTop, uMid, uHorizon, uSunColor, uSunDir; uniform float uWarm; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float h = d.y;
        vec3 col = mix(uHorizon, uMid, smoothstep(-0.05, 0.22, h));
        col = mix(col, uTop, smoothstep(0.18, 0.75, h));
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunColor * (pow(s, 6.0) * 0.35 + pow(s, 60.0) * 0.5 + pow(s, 900.0) * 1.5) * (0.35 + 0.65 * uWarm);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new Mesh(new SphereGeometry(90, 32, 16), mat);
  m.frustumCulled = false;
  m.renderOrder = -1;
  return m;
}

function farRidges() {
  const g = new Group();
  [[32, 4.2, '#2f3a50', 0.0], [44, 6.5, '#3a4560', 2.1], [57, 9.5, '#47526d', 4.3]].forEach(([R, amp, col, seed]) => {
    const segs = 240, pos = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2, x = Math.cos(a) * R, z = Math.sin(a) * R;
      const n = eroded(Math.cos(a) * 3 + seed, Math.sin(a) * 3 - seed);
      pos.push(x, -3, z, x, -0.5 + amp * Math.pow(n, 1.6) * 1.6, z);
      if (i < segs) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    // oben Grat-Farbe, unten heller (Dunst im Tal)
    const top = new Color(col), low = new Color(col).lerp(new Color('#8090a8'), 0.35), cols = [];
    for (let i = 0; i <= segs; i++) cols.push(low.r, low.g, low.b, top.r, top.g, top.b);
    geo.setAttribute('color', new Float32BufferAttribute(cols, 3));
    geo.setIndex(idx);
    g.add(new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, side: DoubleSide })));
  });
  // Talboden bis zu den Graten: keine Himmelslücke hinter dem Geländerand
  const floor = new Mesh(new CylinderGeometry(70, 70, 0.1, 64, 1, false), std('#1c232c', 1));
  floor.position.y = -0.33;
  g.add(floor);
  return g;
}

function snowfall(count) {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) { pos[i * 3] = Math.random() * 10; pos[i * 3 + 1] = Math.random() * 7; pos[i * 3 + 2] = Math.random() * 10; seed[i] = Math.random(); }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new BufferAttribute(seed, 1));
  const mat = new ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uCam: { value: new Vector3() }, uFall: { value: 0 }, uPR: { value: 1 }, uColor: { value: new Color('#e9f1f8') }, uOpacity: { value: 0.55 } },
    vertexShader: `uniform vec3 uCam; uniform float uFall, uPR; attribute float aSeed; varying float vA;
      void main(){ vec3 box = vec3(10.0, 7.0, 10.0); vec3 p = position;
        p.y -= uFall * (0.6 + aSeed * 0.6); p.x += sin(uFall * 0.7 + aSeed * 6.283) * 0.35;
        vec3 rel = mod(p - uCam + box * 0.5, box) - box * 0.5;
        vec4 mv = viewMatrix * vec4(uCam + rel, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = -mv.z;
        gl_PointSize = 22.0 * uPR * (0.5 + aSeed * 0.8) / max(d, 0.1);
        vA = smoothstep(0.4, 1.4, d) * (1.0 - smoothstep(3.5, 5.0, d)); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vA;
      void main(){ float r = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, r) * vA * uOpacity; if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
  });
  const pts = new Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

function trailRibbon(points) {
  const n = points.length, pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), idx = [];
  const up = new Vector3(0, 1, 0), t = new Vector3(), side = new Vector3();
  const W = 0.02;
  for (let i = 0; i < n; i++) {
    t.subVectors(points[Math.min(n - 1, i + 1)], points[Math.max(0, i - 1)]).normalize();
    side.crossVectors(t, up).normalize().multiplyScalar(W);
    const p = points[i];
    pos.set([p.x - side.x, p.y, p.z - side.z, p.x + side.x, p.y, p.z + side.z], i * 6);
    uv.set([i / (n - 1), 0, i / (n - 1), 1], i * 4);
    if (i < n - 1) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mat = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false, side: DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: { uProgress: { value: 0 }, uColor: { value: new Color('#ffd2a0') } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uProgress; uniform vec3 uColor; varying vec2 vUv;
      void main(){ float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
        float core = smoothstep(0.0, 1.0, across);
        float head = 1.0 - smoothstep(uProgress - 0.004, uProgress + 0.002, vUv.x);
        float tail = mix(0.28, 1.0, smoothstep(uProgress - 0.18, uProgress, vUv.x));
        float a = core * core * head * tail * 0.7;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
  });
  return new Mesh(geo, mat);
}

/** Wolkenmeer unterhalb des Gipfels: erscheint erst in großer Höhe (Opazität über den Fortschritt). */
function cloudSea() {
  const mat = new ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uOpacity: { value: 0 }, uLit: { value: new Color('#f3dccb') }, uShade: { value: new Color('#7f8aa3') } },
    vertexShader: `varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
    fragmentShader: `uniform float uOpacity; uniform vec3 uLit, uShade; varying vec3 vW;
      ${NOISE_GLSL}
      float f(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * mu_noise(vec3(p, 1.3 * float(i))); p *= 2.07; a *= 0.5; } return s; }
      void main(){ vec2 p = vW.xz * 0.11;
        float n = f(p + vec2(f(p * 0.6) * 1.6, 0.0));
        float a = smoothstep(0.36, 0.62, n);
        float r = length(vW.xz);
        a *= smoothstep(2.2, 5.0, r) * (1.0 - smoothstep(48.0, 66.0, r));
        vec3 col = mix(uShade, uLit, smoothstep(0.4, 0.75, n));
        gl_FragColor = vec4(col, a * uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new Mesh(new PlaneGeometry(140, 140, 1, 1), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 1.15;
  m.renderOrder = 2;
  return m;
}

function contactShadow() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d'), g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const m = new Mesh(new PlaneGeometry(0.26, 0.26), new MeshBasicMaterial({ map: new CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  m.renderOrder = 1;
  return m;
}

function boulders(T, count) {
  const geo = new IcosahedronGeometry(1, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const s = 0.8 + hash(p.getX(i) * 7.1, p.getY(i) * 3.3 + p.getZ(i)) * 0.4; p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.7, p.getZ(i) * s); }
  geo.computeVertexNormals();
  const mesh = new InstancedMesh(geo, std('#6a6560', 0.95, { flatShading: true }), count);
  const o = new Object3D(), n = new Vector3(), q = new Quaternion();
  let placed = 0, tries = 0;
  while (placed < count && tries < count * 30) {
    tries++;
    const x = (hash(tries, 1.3) - 0.5) * 22, z = (hash(2.7, tries) - 0.5) * 22;
    const y = T.sample(x, z);
    T.normalAt(x, z, n);
    if (y < 0.3 || y > T.maxH * 0.42 || n.y < 0.75) continue;
    // nicht direkt auf dem Pfad
    let near = false;
    for (let k = 0; k <= 40; k++) { const rp = T.flat.getPointAt(k / 40); if (Math.hypot(rp.x - x, rp.z - z) < 0.3) { near = true; break; } }
    if (near) continue;
    const s = 0.03 + Math.pow(hash(x, z), 3) * 0.14;
    o.position.set(x, y + s * 0.15, z);
    q.setFromUnitVectors(new Vector3(0, 1, 0), n);
    o.quaternion.copy(q); o.rotateY(hash(z, x) * 6.28);
    o.scale.setScalar(s);
    o.updateMatrix();
    mesh.setMatrixAt(placed++, o.matrix);
  }
  mesh.count = placed;
  mesh.receiveShadow = true;
  return mesh;
}

function trailPoles(route, T) {
  const g = new Group();
  const white = std('#eef0f2', 0.6), red = std('#c8342a', 0.6);
  const geoW = new CylinderGeometry(0.0055, 0.0055, 0.075, 6), geoR = new CylinderGeometry(0.0058, 0.0058, 0.025, 6);
  const t = new Vector3();
  for (let i = 0; i < 16; i++) {
    const u = (i + 0.6) / 16.5;
    const p = route.getPointAt(u); route.getTangentAt(u, t);
    const s = i % 2 ? 1 : -1, x = p.x + t.z * 0.1 * s, z = p.z - t.x * 0.1 * s, y = T.sample(x, z);
    const w = new Mesh(geoW, white); w.position.set(x, y + 0.037, z); g.add(w);
    const r = new Mesh(geoR, red); r.position.set(x, y + 0.062, z); g.add(r);
  }
  return g;
}

/* ======================================================================
   Öffentliche API
   ====================================================================== */
export async function createClimb(canvas, { reducedMotion = false, isMobile = false, onAltitude } = {}) {
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: !isMobile, alpha: false, powerPreference: 'high-performance' });
  } catch (e) {
    return null;
  }
  const maxDpr = isMobile ? 1.5 : 1.75;
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  scene.fog = new Fog('#4a5470', 16, 62);
  const camera = new PerspectiveCamera(isMobile ? 52 : 40, 1, 0.03, 200);

  const sky = skyDome();
  scene.add(sky);
  scene.add(farRidges());

  const hemi = new HemisphereLight('#a7bcd6', '#2a2522', 0.7);
  scene.add(hemi);
  const sunOffset = new Vector3(-10, 4.2, -6).normalize();
  const sun = new DirectionalLight('#ffe2c4', 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -1.1, right: 1.1, top: 1.1, bottom: -1.1, near: 0.5, far: 30 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.015;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const fill = new DirectionalLight('#9db2cf', 0.7);
  fill.position.set(6, 8, 10);
  scene.add(fill);
  const sunCold = new Color('#9fb3d2'), sunWarm = new Color('#ffc58f');

  await yieldFrame();
  const T = await buildTerrain(isMobile ? 170 : 256);
  scene.add(T.mesh);
  await yieldFrame();

  // Route auf der eingekerbten Oberfläche
  const routePts = T.flat.getSpacedPoints(220).map((v) => new Vector3(v.x, T.sample(v.x, v.z), v.z));
  const route = new CatmullRomCurve3(routePts, false, 'catmullrom', 0.5);
  const base = route.getPointAt(0), top = route.getPointAt(1);
  const ribbon = trailRibbon(route.getSpacedPoints(700).map((p) => new Vector3(p.x, T.sample(p.x, p.z) + 0.028, p.z)));
  scene.add(ribbon);
  scene.add(trailPoles(route, T));
  scene.add(boulders(T, isMobile ? 70 : 140));

  const hut = gableHut();
  hut.position.set(T.hutAt.x, T.sample(T.hutAt.x, T.hutAt.z) - 0.01, T.hutAt.z);
  hut.rotation.y = Math.atan2(base.x - hut.position.x, base.z - hut.position.z) * 0.3 + 0.4;
  scene.add(hut);
  [['#e8823a', -0.14, 0.05, 0.4], ['#e3c04a', 0.16, -0.1, -0.5]].forEach(([c, dx, dz, ry]) => {
    const t = domeTent(c);
    const x = T.campAt.x + dx, z = T.campAt.z + dz;
    t.position.set(x, T.sample(x, z), z); t.rotation.y = ry;
    scene.add(t);
  });
  const summit = summitSet();
  summit.position.copy(top);
  scene.add(summit);
  const flagG = flag();
  flagG.position.set(top.x + 0.14, top.y, top.z + 0.05);
  flagG.scale.setScalar(0.001);
  scene.add(flagG);

  const clouds = cloudSea();
  scene.add(clouds);
  const climber = buildClimber();
  scene.add(climber.root);
  const blob = contactShadow();
  scene.add(blob);
  const snow = snowfall(isMobile ? 260 : 520);
  snow.material.uniforms.uPR.value = dpr;
  scene.add(snow);

  // Zustand
  const state = { target: reducedMotion ? 1 : 0, p: reducedMotion ? 1 : 0, active: !!reducedMotion, hidden: document.hidden, dirty: true, phase: 0, yaw: 0, facing: 1, frames: 0 };
  const tmpP = new Vector3(), tmpT = new Vector3(), tmpN = new Vector3(), camPos = new Vector3(), look = new Vector3();
  const startLook = new Vector3(0, 3.6, 0), endLook = new Vector3(top.x, top.y + 0.05, top.z);

  // Fortschritt -> Routenparameter: Mischung aus Weglänge und Höhengewinn
  const N = 240, lut = new Float32Array(N + 1);
  {
    let rise = 0, prevY = base.y; const rises = [0];
    for (let i = 1; i <= N; i++) { const y = route.getPointAt(i / N).y; rise += Math.max(0, y - prevY); prevY = y; rises.push(rise); }
    for (let i = 0; i <= N; i++) lut[i] = 0.5 * (i / N) + 0.5 * (rises[i] / rise);
  }
  const progressToU = (p) => {
    if (p <= 0) return 0; if (p >= 1) return 1;
    let lo = 0, hi = N;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (lut[mid] < p) lo = mid; else hi = mid; }
    return (lo + (p - lut[lo]) / Math.max(1e-6, lut[hi] - lut[lo])) / N;
  };
  const altitudeAt = (y) => Math.round(2150 + ((y - base.y) / (top.y - base.y)) * (4164 - 2150));
  const routeLen = route.getLength();

  const skyU = sky.material.uniforms;
  const C = (h) => new Color(h);
  const skyTop0 = C('#070d18'), skyTop1 = C('#16294a'), skyMid0 = C('#1a2740'), skyMid1 = C('#3f5478');
  const hor0 = C('#3a4560'), hor1 = C('#e3a47c'), fog0 = C('#3d4862'), fog1 = C('#b99a8e');

  function atmosphere(u) {
    const w = smooth(0.05, 1, u);
    skyU.uTop.value.copy(skyTop0).lerp(skyTop1, w);
    skyU.uMid.value.copy(skyMid0).lerp(skyMid1, w);
    skyU.uHorizon.value.copy(hor0).lerp(hor1, w);
    skyU.uSunColor.value.copy(sunCold).lerp(sunWarm, w);
    skyU.uSunDir.value.copy(sunOffset);
    skyU.uWarm.value = w;
    scene.fog.color.copy(fog0).lerp(fog1, w * 0.85);
    sun.color.copy(sunCold).lerp(sunWarm, smooth(0.1, 0.95, u));
    sun.intensity = lerp(1.6, 2.8, u);
    hemi.intensity = lerp(1.05, 0.95, u);
    fill.intensity = lerp(0.95, 0.5, u);
    clouds.material.uniforms.uOpacity.value = smooth(0.5, 0.92, u) * 0.92;
    clouds.visible = u > 0.5;
  }

  function pose(u, dp) {
    route.getPointAt(u, tmpP);
    route.getTangentAt(Math.min(u, 0.999), tmpT);
    climber.root.position.copy(tmpP);
    if (Math.abs(dp) > 1e-5) state.facing = dp > 0 ? 1 : -1;
    const yawTarget = Math.atan2(tmpT.x, tmpT.z) + (state.facing < 0 ? Math.PI : 0);
    let d = yawTarget - state.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    state.yaw += d * (reducedMotion ? 1 : 0.25);
    climber.root.rotation.y = state.yaw;
    state.phase += Math.abs(dp) * routeLen * 46;
    const atTop = smooth(0.975, 1, u), walk = 1 - atTop, ph = state.phase;
    climber.legs.forEach(({ hip, knee }, i) => {
      const s = Math.sin(ph + i * Math.PI);
      hip.rotation.x = -s * 0.5 * walk;
      knee.rotation.x = (0.12 + Math.max(0, -Math.cos(ph + i * Math.PI)) * 0.75) * walk;
    });
    const [aL, aR] = climber.arms;
    aL.sh.rotation.x = lerp(Math.sin(ph) * 0.4, -2.75, atTop); aL.el.rotation.x = lerp(-0.35, -0.1, atTop);
    aR.sh.rotation.x = -0.35 - Math.sin(ph) * 0.25 * walk; aR.el.rotation.x = -0.55;
    const slope = Math.max(0, tmpT.y);
    climber.body.rotation.x = slope * 0.55 * state.facing * walk;
    climber.body.position.y = Math.abs(Math.sin(ph)) * 0.006 * walk;
    // Kontaktschatten entlang der Hangnormalen
    T.normalAt(tmpP.x, tmpP.z, tmpN);
    blob.position.copy(tmpP).addScaledVector(tmpN, 0.006);
    blob.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), tmpN);
    // Sonne + Schattenkamera folgen der Figur
    sun.target.position.copy(tmpP);
    sun.position.copy(tmpP).addScaledVector(sunOffset, 12);
    flagG.scale.setScalar(Math.max(0.001, smooth(0.95, 1, u)));
    ribbon.material.uniforms.uProgress.value = u;
    atmosphere(u);
    return tmpP;
  }

  function frameCamera(u, p) {
    const wS = 1 - smooth(0, 0.16, u), wE = smooth(0.82, 1, u);
    const follow = isMobile ? 4.0 : 3.3;
    let az = 0.95 - 1.25 * u, el = 0.34, dist = follow;
    look.set(p.x, p.y + 0.24, p.z);
    az = lerp(az, 0.32, wS); el = lerp(el, 0.3, wS); dist = lerp(dist, isMobile ? 20 : 16, wS); look.lerp(startLook, wS);
    az = lerp(az, 0.2, wE); el = lerp(el, 0.26, wE); dist = lerp(dist, isMobile ? 7.5 : 5.6, wE); look.lerp(endLook, wE);
    camPos.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist).add(look);
    const ground = T.sample(camPos.x, camPos.z) + 0.35;
    if (camPos.y < ground) camPos.y = ground;
    camera.position.copy(camPos);
    camera.lookAt(look);
    sky.position.copy(camPos);
    snow.material.uniforms.uCam.value.copy(camPos);
    snow.material.uniforms.uFall.value = state.p * 9;
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
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    state.dirty = true;
  }

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
    renderer, tick, measure,
    setProgress(u) { if (!reducedMotion) state.target = Math.min(1, Math.max(0, u)); },
    setActive(on) { state.active = on || reducedMotion; if (on) state.dirty = true; },
    getState: () => ({ p: state.p, target: state.target, active: state.active, hidden: state.hidden, frames: state.frames, climber: climber.root.position.toArray() }),
    // Shader vorab übersetzen: parallel, wenn möglich; sonst Objekt für Objekt mit Pausen
    warmup: async () => {
      if (renderer.extensions.has('KHR_parallel_shader_compile')) return renderer.compileAsync(scene, camera).catch(() => {});
      for (const child of [...scene.children]) {
        if (child.isLight || !child.visible) continue;
        try { renderer.compile(child, camera, scene); } catch { /* beim ersten Bild nachgeholt */ }
        await yieldFrame();
      }
    },
    dispose() { ro.disconnect(); document.removeEventListener('visibilitychange', onVisibility); renderer.dispose(); },
  };
}
