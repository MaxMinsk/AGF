/**
 * Shadow probe: checks Three.js internals via page.evaluate for shadow map state.
 */
import { chromium } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await page.goto('http://localhost:5173/?project=kaboom-crew', {
    waitUntil: 'domcontentloaded', timeout: 30000
  });
  await page.waitForFunction(() => Boolean(window.__agf), undefined, { timeout: 25000 });
  await page.waitForTimeout(1000);

  // Dismiss title screen
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })));
  await page.waitForTimeout(100);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true })));

  // Wait for playing phase
  try {
    await page.waitForFunction(() => {
      const snap = window.__agf.snapshot();
      const gs = snap.entities.find(e => e.id === 'kaboom.game-state');
      return gs?.components?.MatchState?.phase === 'playing';
    }, undefined, { timeout: 8000 });
  } catch(e) { console.log('Phase timeout:', e.message); }

  await page.waitForTimeout(2000);

  // Query Three.js renderer shadow map state directly
  const shadowInfo = await page.evaluate(() => {
    // Try to access the Three.js renderer through the AGF internals
    // The renderer is exposed indirectly — probe through the canvas
    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'no canvas' };

    // Check if __agf has any way to get renderer internals
    const agf = window.__agf;
    const diagInfo = agf.diagnostics ? agf.diagnostics() : null;

    // Use rendererInfo if available
    const rendererInfo = agf.rendererInfo ? agf.rendererInfo() : null;

    return {
      canvasFound: true,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      diagInfo: diagInfo ? JSON.stringify(diagInfo).slice(0, 500) : null,
      rendererInfo: rendererInfo,
    };
  });
  console.log('Shadow probe info:');
  console.log(JSON.stringify(shadowInfo, null, 2));

  // Take a screenshot with a light background temporarily? No — just check pixel sampling
  // Check specific pixels where shadows should appear (under player character)
  const pixelCheck = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    // Sample pixels near center of canvas where player character is
    const ctx = (canvas).getContext('2d');
    if (!ctx) return { error: 'no 2d context on webgpu canvas' };
    const w = canvas.width;
    const h = canvas.height;
    const imageData = ctx.getImageData(w/2, h/2, 10, 10);
    return { w, h, sample: Array.from(imageData.data.slice(0, 16)) };
  }).catch(e => ({ error: e.message }));
  console.log('Pixel check:', JSON.stringify(pixelCheck));

  // Full screenshot for visual inspection
  const SCREENSHOT_PATH = join(__dirname, 'shadow-check-2026-06-04.png');
  await page.screenshot({ path: SCREENSHOT_PATH });
  console.log(`Screenshot saved: ${SCREENSHOT_PATH}`);

  await browser.close();
})();
