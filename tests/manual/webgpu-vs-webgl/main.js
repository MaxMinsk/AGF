// AGF S60 — WebGPU vs WebGL spike harness.
//
// Same scene rendered by either `WebGLRenderer` (?renderer=webgl) or
// `WebGPURenderer` (?renderer=webgpu). Scene complexity is parameterised
// so we can drive both renderers at light/medium/heavy load:
//
//   ?renderer=webgl|webgpu     default: webgl
//   ?spheres=N                 default: 200
//   ?boxes=N                   default: 200
//   ?shadows=1|0               default: 1
//   ?fps=1|0                   default: 1 — show on-screen HUD
//
// Exposes `window.__webgpuSpike` for the playwright measurement script:
//
//   {
//     renderer: "webgl" | "webgpu",
//     ready: boolean,
//     framesRendered: number,
//     fpsAvg: number,   // sliding window over the last second
//     frameMsAvg: number,
//     drawCalls: number,
//     triangles: number,
//     spheres, boxes, shadows
//   }
//
// Run via Vite dev server: open http://localhost:5173/tests/manual/webgpu-vs-webgl/

import * as THREE from "three";

// WebGPURenderer is published as a separate entrypoint in three.js 0.184.
// It pulls in the node-material stack — heavier than the WebGL bundle —
// so we only import it when the renderer query param actually asks for
// it.
async function makeRenderer(kind, canvas) {
  if (kind === "webgpu") {
    if (navigator.gpu === undefined) {
      throw new Error("navigator.gpu is undefined — this browser doesn't expose WebGPU. Use Chrome/Edge/Safari 18.4+ or Firefox 141+.");
    }
    const { WebGPURenderer } = await import("three/webgpu");
    const renderer = new WebGPURenderer({ canvas, antialias: true });
    // `.init()` is async on WebGPURenderer — it asks for the GPUAdapter +
    // GPUDevice. Returns a Promise; await before the first .renderAsync().
    await renderer.init();
    return { renderer, mode: "webgpu" };
  }
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  return { renderer, mode: "webgl" };
}

function readParams() {
  const u = new URL(window.location.href);
  const get = (k, d) => u.searchParams.get(k) ?? d;
  const num = (k, d) => Math.max(0, Number(get(k, d)) | 0);
  return {
    renderer: get("renderer", "webgl") === "webgpu" ? "webgpu" : "webgl",
    spheres: num("spheres", 200),
    boxes: num("boxes", 200),
    shadows: get("shadows", "1") !== "0",
    fps: get("fps", "1") !== "0"
  };
}

function buildScene(params) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x171f2d);

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0x2c3447, roughness: 0.95, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = params.shadows;
  scene.add(ground);

  // Sun.
  const sun = new THREE.DirectionalLight(0xfff2db, 1.3);
  sun.position.set(10, 14, 8);
  sun.castShadow = params.shadows;
  if (params.shadows) {
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -20; c.right = 20; c.top = 20; c.bottom = -20;
    c.near = 0.1; c.far = 60;
  }
  scene.add(sun);

  // Hemi fill.
  const hemi = new THREE.HemisphereLight(0xc9e1ff, 0x202435, 0.45);
  scene.add(hemi);

  // Two rotating groups so the user sees continuous motion + the perf
  // numbers reflect a real draw-each-frame load (no static-scene caching
  // wins). Box ring rotates CCW around Y; sphere ring rotates CW around
  // a tilted axis so the two layers slide past each other.
  const boxGroup = new THREE.Group();
  scene.add(boxGroup);
  const sphereGroup = new THREE.Group();
  scene.add(sphereGroup);

  // Boxes — opaque, varied colours, distributed evenly on concentric rings.
  // Ring radius grows logarithmically so high counts still fit on screen.
  const boxGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  const boxesPerRing = Math.max(8, Math.ceil(Math.sqrt(params.boxes) * 2));
  for (let i = 0; i < params.boxes; i++) {
    const ring = Math.floor(i / boxesPerRing);
    const slot = i % boxesPerRing;
    const r = 3 + ring * 1.4;
    const a = (slot / boxesPerRing) * Math.PI * 2 + ring * 0.27;
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(i / params.boxes, 0.55, 0.5),
      roughness: 0.65,
      metalness: 0
    });
    const mesh = new THREE.Mesh(boxGeo, m);
    mesh.position.set(Math.cos(a) * r, 0.4, Math.sin(a) * r);
    mesh.rotation.y = a;
    // Store the slot's base parameters so the frame loop can add a
    // gentle Y-bobbing without per-frame allocations.
    mesh.userData.phase = i * 0.21;
    mesh.userData.baseY = 0.4;
    mesh.castShadow = params.shadows;
    mesh.receiveShadow = params.shadows;
    boxGroup.add(mesh);
  }

  // Spheres — metallic-ish, varied roughness, evenly distributed on concentric rings.
  const sphereGeo = new THREE.SphereGeometry(0.45, 20, 16);
  const spheresPerRing = Math.max(8, Math.ceil(Math.sqrt(params.spheres) * 2));
  for (let i = 0; i < params.spheres; i++) {
    const ring = Math.floor(i / spheresPerRing);
    const slot = i % spheresPerRing;
    const r = 3.5 + ring * 1.4;
    const a = (slot / spheresPerRing) * Math.PI * 2 - ring * 0.27;
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(((i / params.spheres) + 0.5) % 1, 0.5, 0.55),
      roughness: 0.2 + (i % 8) * 0.08,
      metalness: 0.5 + (i % 3) * 0.15
    });
    const mesh = new THREE.Mesh(sphereGeo, m);
    mesh.position.set(Math.cos(a) * r, 1.6, Math.sin(a) * r);
    mesh.userData.phase = i * 0.17 + Math.PI / 3;
    mesh.userData.baseY = 1.6;
    mesh.castShadow = params.shadows;
    mesh.receiveShadow = params.shadows;
    sphereGroup.add(mesh);
  }

  // Slight tilt on the sphere ring so the two layers visually separate.
  sphereGroup.rotation.x = 0.18;

  return { scene, boxGroup, sphereGroup };
}

async function main() {
  const params = readParams();
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);

  // Stretch the canvas to fill the viewport via CSS — without explicit
  // styles a dynamically-created <canvas> defaults to 300×150 and the
  // render lands in a corner on high-DPR monitors.
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";

  const setSize = (renderer) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    // `true` (default) makes three.js write `canvas.style.{width,height}`
    // alongside the WebGL drawing-buffer resize. We already pinned the
    // CSS size above so the renderer's writes are no-ops; pass true so
    // future viewport changes don't drift.
    renderer.setSize(w, h, true);
  };

  let rendererPair;
  try {
    rendererPair = await makeRenderer(params.renderer, canvas);
  } catch (err) {
    document.getElementById("hud").textContent = "renderer-init-failed: " + (err?.message ?? err);
    window.__webgpuSpike = { renderer: params.renderer, ready: false, error: String(err?.message ?? err) };
    return;
  }
  const { renderer, mode } = rendererPair;
  if (params.shadows) {
    renderer.shadowMap.enabled = true;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  setSize(renderer);
  window.addEventListener("resize", () => {
    setSize(renderer);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  const { scene, boxGroup, sphereGroup } = buildScene(params);
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
  // Camera looks straight down the +Z axis at the origin so the rotating
  // rings stay centred in frame regardless of scene scale.
  camera.position.set(0, 10, 22);
  camera.lookAt(0, 1, 0);

  const stats = {
    renderer: mode,
    ready: true,
    framesRendered: 0,
    fpsAvg: 0,
    frameMsAvg: 0,
    drawCalls: 0,
    triangles: 0,
    spheres: params.spheres,
    boxes: params.boxes,
    shadows: params.shadows
  };
  window.__webgpuSpike = stats;

  // Sliding-window FPS over the last second.
  const samples = []; // entries: { tNow, dt }
  let lastFrameTime = performance.now();
  const hud = document.getElementById("hud");

  function updateHud() {
    if (!params.fps) {
      hud.style.display = "none";
      return;
    }
    hud.textContent =
      `renderer: ${mode}\n` +
      `fps:      ${stats.fpsAvg.toFixed(1)}\n` +
      `frameMs:  ${stats.frameMsAvg.toFixed(2)}\n` +
      `draws:    ${stats.drawCalls}\n` +
      `tris:     ${stats.triangles}\n` +
      `spheres:  ${params.spheres}\n` +
      `boxes:    ${params.boxes}\n` +
      `shadows:  ${params.shadows ? "on" : "off"}`;
  }

  const renderOnce =
    mode === "webgpu"
      ? () => renderer.renderAsync(scene, camera)
      : () => { renderer.render(scene, camera); return Promise.resolve(); };

  // `WebGPURenderer.info.render.calls` accumulates across `.render()`
  // calls — unlike `WebGLRenderer` it does not auto-reset per render in
  // r0.184. Call `renderer.info.reset()` per frame so the HUD shows
  // per-frame draw counts on both renderers. (WebGL also exposes
  // `reset()` and supports manual control via `info.autoReset = false`;
  // we use the explicit reset to keep both paths identical.)
  const startTime = performance.now();

  async function frame(now) {
    const elapsed = (now - startTime) / 1000;
    // Animate: counter-rotating rings + gentle bob.
    boxGroup.rotation.y = elapsed * 0.35;
    sphereGroup.rotation.y = -elapsed * 0.25;
    for (const m of boxGroup.children) {
      m.position.y = m.userData.baseY + Math.sin(elapsed * 1.6 + m.userData.phase) * 0.15;
    }
    for (const m of sphereGroup.children) {
      m.position.y = m.userData.baseY + Math.sin(elapsed * 1.4 + m.userData.phase) * 0.20;
    }

    const dt = now - lastFrameTime;
    lastFrameTime = now;
    samples.push({ tNow: now, dt });
    // Trim to last 1000 ms.
    while (samples.length > 0 && now - samples[0].tNow > 1000) samples.shift();
    if (samples.length > 1) {
      const totalDt = samples.reduce((a, s) => a + s.dt, 0);
      stats.fpsAvg = (samples.length - 1) * 1000 / totalDt;
      stats.frameMsAvg = totalDt / (samples.length - 1);
    }
    stats.framesRendered += 1;
    await renderOnce();
    // Read draw counters AFTER the render call so the field actually
    // contains this frame's work. Three.js renames the per-frame draw
    // counter between renderers (`calls` is per-frame on WebGL but
    // cumulative on WebGPU; `frameCalls` is per-frame on WebGPU's new
    // Info class but doesn't exist on WebGLRenderer's old info shape).
    if (renderer.info?.render !== undefined) {
      const r = renderer.info.render;
      stats.drawCalls = mode === "webgpu" ? (r.frameCalls ?? r.drawCalls ?? 0) : (r.calls ?? 0);
      stats.triangles = r.triangles ?? 0;
    }
    updateHud();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error("spike main() crashed:", err);
  document.getElementById("hud").textContent = "spike-crash: " + (err?.message ?? err);
  window.__webgpuSpike = { ready: false, error: String(err?.message ?? err) };
});
