export type AppHandle = {
  readonly canvas: HTMLCanvasElement;
  dispose(): void;
};

export function createApp(root: HTMLElement): AppHandle {
  root.textContent = "";

  const shell = document.createElement("main");
  shell.className = "app-shell";

  const canvas = document.createElement("canvas");
  canvas.className = "engine-canvas";
  canvas.setAttribute("data-testid", "engine-canvas");

  const status = document.createElement("section");
  status.className = "status-panel";
  status.setAttribute("aria-label", "Engine status");
  status.innerHTML = `
    <h1 class="status-title">AgentsGameFramework</h1>
    <p class="status-copy">Sprint 1 scaffold is live. The canvas is intentionally simple until the Three.js renderer lands.</p>
  `;

  shell.append(canvas, status);
  root.append(shell);

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("2D canvas context is unavailable.");
  }

  let animationFrame = 0;
  let disposed = false;

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(bounds.width * ratio));
    const height = Math.max(1, Math.floor(bounds.height * ratio));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  };

  const render = (time: number) => {
    if (disposed) {
      return;
    }

    resize();
    drawBootstrapScene(context, canvas.width, canvas.height, time / 1000);
    animationFrame = window.requestAnimationFrame(render);
  };

  window.addEventListener("resize", resize);
  animationFrame = window.requestAnimationFrame(render);

  return {
    canvas,
    dispose() {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      root.textContent = "";
    }
  };
}

function drawBootstrapScene(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  seconds: number
) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#10243a");
  gradient.addColorStop(0.55, "#173f4f");
  gradient.addColorStop(1, "#071019");

  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const centerX = width * 0.5;
  const centerY = height * 0.52;
  const pulse = 0.5 + Math.sin(seconds * 1.8) * 0.5;
  const coreRadius = Math.max(18, Math.min(width, height) * 0.055);

  context.save();
  context.translate(centerX, centerY);
  context.rotate(seconds * 0.28);
  context.fillStyle = "rgba(120, 228, 255, 0.18)";
  context.fillRect(-coreRadius * 4.6, -coreRadius * 0.35, coreRadius * 9.2, coreRadius * 0.7);
  context.fillStyle = "rgba(180, 255, 222, 0.22)";
  context.fillRect(-coreRadius * 0.35, -coreRadius * 4.6, coreRadius * 0.7, coreRadius * 9.2);
  context.restore();

  const glow = context.createRadialGradient(centerX, centerY, 1, centerX, centerY, coreRadius * 3.2);
  glow.addColorStop(0, `rgba(144, 255, 232, ${0.72 + pulse * 0.18})`);
  glow.addColorStop(0.28, "rgba(84, 207, 255, 0.32)");
  glow.addColorStop(1, "rgba(84, 207, 255, 0)");
  context.fillStyle = glow;
  context.beginPath();
  context.arc(centerX, centerY, coreRadius * 3.2, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#dfffee";
  context.beginPath();
  context.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = "rgba(234, 244, 255, 0.42)";
  context.lineWidth = Math.max(1, Math.min(width, height) * 0.002);
  for (let index = 1; index <= 3; index += 1) {
    context.beginPath();
    context.arc(centerX, centerY, coreRadius * (1.7 + index * 0.9 + pulse * 0.18), 0, Math.PI * 2);
    context.stroke();
  }
}
