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

  // Boxes — opaque, varied colours.
  const boxGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  for (let i = 0; i < params.boxes; i++) {
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL((i / params.boxes), 0.55, 0.5),
      roughness: 0.65,
      metalness: 0
    });
    const mesh = new THREE.Mesh(boxGeo, m);
    const r = 4 + Math.sqrt(i) * 0.85;
    const a = i * 0.61;
    mesh.position.set(Math.cos(a) * r, 0.4, Math.sin(a) * r);
    mesh.rotation.y = a;
    mesh.castShadow = params.shadows;
    mesh.receiveShadow = params.shadows;
    scene.add(mesh);
  }

  // Spheres — metallic-ish, varied roughness.
  const sphereGeo = new THREE.SphereGeometry(0.45, 20, 16);
  for (let i = 0; i < params.spheres; i++) {
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(((i / params.spheres) + 0.5) % 1, 0.5, 0.55),
      roughness: 0.2 + (i % 8) * 0.08,
      metalness: 0.5 + (i % 3) * 0.15
    });
    const mesh = new THREE.Mesh(sphereGeo, m);
    const r = 4 + Math.sqrt(i) * 0.85;
    const a = (i * 0.61) + Math.PI / 4;
    mesh.position.set(Math.cos(a) * r, 1.2, Math.sin(a) * r);
    mesh.castShadow = params.shadows;
    mesh.receiveShadow = params.shadows;
    scene.add(mesh);
  }

  return scene;
}

async function main() {
  const params = readParams();
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);

  const setSize = (renderer) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(w, h, false);
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

  const scene = buildScene(params);
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 12, 28);
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

  async function frame(now) {
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
    if (renderer.info?.render !== undefined) {
      stats.drawCalls = renderer.info.render.calls ?? 0;
      stats.triangles = renderer.info.render.triangles ?? 0;
    }
    updateHud();
    await renderOnce();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error("spike main() crashed:", err);
  document.getElementById("hud").textContent = "spike-crash: " + (err?.message ?? err);
  window.__webgpuSpike = { ready: false, error: String(err?.message ?? err) };
});
