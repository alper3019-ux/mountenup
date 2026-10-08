/**
 * WebGL-Szene: prozedurales Gebirgsmassiv (Gitter + Simplex-Noise im Shader,
 * keine externen Modelle), ein paar Gipfel-Kreuze aus Linien und ein
 * Schneepartikel-Feld. Reagiert auf Scroll (Position/Schneegrenze) und Maus.
 *
 * Performance: Pixel-Ratio gedeckelt (1.75 Desktop / 1.5 mobil), gröberes
 * Gitter auf kleinen Screens, Rendering pausiert bei verstecktem Tab,
 * dt auf 100 ms begrenzt.
 */
import {
  WebGLRenderer, Scene, PerspectiveCamera, PlaneGeometry, ShaderMaterial, Mesh, Group,
  BufferGeometry, Float32BufferAttribute, Points, AdditiveBlending, LineSegments, LineBasicMaterial,
  Vector2, MathUtils, DoubleSide,
} from 'three';
import { terrainVertex, terrainFragment } from './shaders/terrain.glsl.js';
import { pointsVertex, pointsFragment } from './shaders/points.glsl.js';
import { KEYS, PROPS } from './keyframes.js';

export function createScene(canvas, { reducedMotion = false } = {}) {
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: window.devicePixelRatio < 2, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { return null; }
  if (!renderer.getContext()) return null;

  const isSmall = () => window.innerWidth < 861;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, isSmall() ? 1.5 : 1.75);
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 60);
  camera.position.set(0, 1.5, 9);

  const root = new Group();
  scene.add(root);

  const seg = coarse || isSmall() ? 70 : 110; // Facetten bewusst sichtbar, aber nicht grob
  const geo = new PlaneGeometry(14, 10, seg, Math.round(seg * 0.7));
  geo.rotateX(-Math.PI / 2);
  const uniforms = {
    uTime: { value: 0 }, uAmp: { value: 1 }, uSnow: { value: 0.4 }, uIntro: { value: reducedMotion ? 1 : 0 },
    uHover: { value: 0 }, uPointer: { value: new Vector2(0, 0) }, uAlpha: { value: 1 },
  };
  const mat = new ShaderMaterial({ vertexShader: terrainVertex, fragmentShader: terrainFragment, uniforms, transparent: true, side: DoubleSide });
  const terrain = new Mesh(geo, mat);
  root.add(terrain);

  // Gipfelmarkierungen (schlichte Kreuze aus Linien, kein Modell)
  const cross = (x, z, h) => {
    const a = 0.07;
    return [x, h + 0.05, z, x, h + a * 3.2, z, x - a, h + a * 2.1, z, x + a, h + a * 2.1, z];
  };
  const cGeo = new BufferGeometry();
  cGeo.setAttribute('position', new Float32BufferAttribute(new Float32Array([...cross(0.3, 0.4, 1.6), ...cross(-2.8, -0.6, 0.85), ...cross(3.2, -0.2, 0.7)]), 3));
  const crosses = new LineSegments(cGeo, new LineBasicMaterial({ color: 0xe8eef4, transparent: true, opacity: 0.8 }));
  root.add(crosses);

  // Schneeflocken
  const count = coarse || isSmall() ? 500 : 1400;
  const pos = new Float32Array(count * 3), scales = new Float32Array(count), phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 16;
    pos[i * 3 + 1] = Math.random() * 6 - 1;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 12;
    scales[i] = 0.3 + Math.random() * 1.1;
    phases[i] = Math.random();
  }
  const pGeo = new BufferGeometry();
  pGeo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  pGeo.setAttribute('aScale', new Float32BufferAttribute(scales, 1));
  pGeo.setAttribute('aPhase', new Float32BufferAttribute(phases, 1));
  const pUniforms = { uTime: { value: 0 }, uPixelRatio: { value: renderer.getPixelRatio() }, uSize: { value: 18 }, uOpacity: { value: reducedMotion ? 0.6 : 0 } };
  const points = new Points(pGeo, new ShaderMaterial({
    vertexShader: pointsVertex, fragmentShader: pointsFragment, uniforms: pUniforms,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  }));
  scene.add(points);

  const cur = { ...KEYS.desktop.hero };
  const target = { ...cur };
  const pointer = new Vector2(0, 0);
  const pointerSmooth = new Vector2(0, 0);
  let anchors = [];
  let elapsed = 0;
  let running = true;
  let paused = false;

  function halfExtents() {
    const h = Math.tan(MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    return { w: h * camera.aspect, h };
  }
  function measure() {
    const els = [...document.querySelectorAll('[data-scene]')];
    const vh = window.innerHeight;
    anchors = [];
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      const top = r.top + window.scrollY;
      const key = el.dataset.scene;
      if (r.height > vh * 1.3) anchors.push({ key, at: top + vh * 0.5 }, { key, at: top + r.height - vh * 0.5 });
      else anchors.push({ key, at: top + r.height / 2 });
    });
    anchors.sort((a, b) => a.at - b.at);
    const maxRef = document.documentElement.scrollHeight - window.innerHeight / 2;
    anchors.forEach((a) => { a.at = Math.min(a.at, maxRef - 1); });
    if (anchors.length) anchors[0].at = Math.min(anchors[0].at, window.innerHeight / 2);
  }
  function computeTarget() {
    const set = isSmall() ? KEYS.mobile : KEYS.desktop;
    if (!anchors.length) { Object.assign(target, set.hero); return; }
    const ref = window.scrollY + window.innerHeight / 2;
    let a = anchors[0], b = anchors[0], t = 0;
    if (ref <= anchors[0].at) a = b = anchors[0];
    else if (ref >= anchors[anchors.length - 1].at) a = b = anchors[anchors.length - 1];
    else {
      for (let i = 0; i < anchors.length - 1; i++) {
        if (ref >= anchors[i].at && ref < anchors[i + 1].at) { a = anchors[i]; b = anchors[i + 1]; t = (ref - a.at) / (b.at - a.at); break; }
      }
    }
    t = MathUtils.clamp((t - 0.12) / 0.76, 0, 1);
    t = t * t * (3 - 2 * t);
    const ka = set[a.key] || set.hero, kb = set[b.key] || set.hero;
    for (const p of PROPS) target[p] = ka[p] + (kb[p] - ka[p]) * t;
  }

  window.addEventListener('pointermove', (e) => {
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  }, { passive: true });

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setPixelRatio(pixelRatio()); renderer.setSize(w, h, false);
    pUniforms.uPixelRatio.value = renderer.getPixelRatio();
    measure();
  }
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { running = !document.hidden; });

  function baseScale() {
    const { w } = halfExtents();
    return MathUtils.clamp(w / 4.2, 0.55, 1.15);
  }

  function update(dt) {
    if (!running) return;
    dt = Math.min(dt, 0.1);
    const speed = paused ? 0 : reducedMotion ? 0.15 : 1;
    elapsed += dt * speed;
    computeTarget();
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 3.2);
    for (const p of PROPS) cur[p] += (target[p] - cur[p]) * k;
    pointerSmooth.lerp(pointer, reducedMotion ? 1 : 1 - Math.exp(-dt * 3));

    const { w, h } = halfExtents();
    root.position.set(cur.x * w, cur.y * h, 0);
    root.scale.setScalar(cur.s * baseScale());
    root.rotation.y = cur.spin + pointerSmooth.x * 0.18;
    root.rotation.z = pointerSmooth.y * 0.05;
    uniforms.uTime.value = elapsed;
    uniforms.uAmp.value = cur.amp;
    uniforms.uSnow.value = cur.snow;
    uniforms.uAlpha.value = cur.alpha;
    uniforms.uPointer.value.copy(pointerSmooth);
    uniforms.uHover.value += ((paused || reducedMotion ? 0 : 1) - uniforms.uHover.value) * (1 - Math.exp(-dt * 2));
    mat.opacity = cur.alpha;
    crosses.material.opacity = 0.85 * cur.alpha * uniforms.uIntro.value;

    points.position.y = Math.sin(elapsed * 0.2) * 0.1;
    points.rotation.y = elapsed * 0.01 + pointerSmooth.x * 0.04;
    pUniforms.uTime.value = elapsed;
    pUniforms.uOpacity.value = 0.85 * cur.alpha * uniforms.uIntro.value;

    camera.position.x = pointerSmooth.x * 0.25;
    camera.lookAt(0, 0.9, 0);
    renderer.render(scene, camera);
  }

  function intro(gsap) {
    const tl = gsap.timeline();
    if (reducedMotion) { uniforms.uIntro.value = 1; pUniforms.uOpacity.value = 0.6; return tl; }
    tl.to(uniforms.uIntro, { value: 1, duration: 2.2, ease: 'power2.out' }, 0)
      .to(pUniforms.uOpacity, { value: 0.85, duration: 2.4, ease: 'power2.out' }, 0.3);
    return tl;
  }

  async function warmup() {
    if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);
    await new Promise((resolve) => setTimeout(resolve, 0));
    renderer.render(scene, camera);
  }
  function setPaused(value) { paused = value; }

  measure();
  return { update, measure, intro, warmup, setPaused, renderer };
}
