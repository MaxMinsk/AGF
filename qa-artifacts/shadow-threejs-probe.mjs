/**
 * Probe Three.js renderer shadow map state via window.__agf internal access.
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
  await page.waitForTimeout(1500);

  // Dismiss title screen
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })));
  await page.waitForTimeout(100);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true })));
  await page.waitForTimeout(2000);

  // Probe Three.js state via window internals
  const threeState = await page.evaluate(() => {
    // Try to find the Three.js renderer on window
    // AGF doesn't expose it directly, but we can search for it
    const keys = Object.keys(window).filter(k =>
      k.startsWith('__') || k.includes('three') || k.includes('Three') || k.includes('renderer')
    );

    // Look for objects with shadowMap property
    let rendererFound = null;
    for (const key of keys) {
      const val = (window)[key];
      if (val && typeof val === 'object' && val.shadowMap !== undefined) {
        rendererFound = {
          key,
          shadowMapEnabled: val.shadowMap?.enabled,
          shadowMapType: val.shadowMap?.type,
          shadowMapAutoUpdate: val.shadowMap?.autoUpdate,
        };
        break;
      }
    }

    // Also try: scene graph traversal via canvas context
    // Three.js WebGPURenderer may be at different keys
    const allKeys = Object.keys(window);
    const possibleRenderers = allKeys.filter(k => {
      try {
        const v = (window)[k];
        return v && typeof v === 'object' && typeof v.render === 'function' && v.shadowMap;
      } catch { return false; }
    });

    return {
      rendererSearchKeys: keys.slice(0, 20),
      rendererFound,
      possibleRenderers,
      agfKeys: Object.keys(window.__agf || {})
    };
  });

  console.log('Three.js probe result:');
  console.log(JSON.stringify(threeState, null, 2));

  // Try to get shadow map state via diagnostics
  const diagResult = await page.evaluate(() => {
    const agf = window.__agf;
    if (!agf) return null;

    // Look for any inspect method
    const inspectKeys = Object.keys(agf).filter(k =>
      k.toLowerCase().includes('inspect') || k.toLowerCase().includes('render')
    );

    const results = {};
    for (const key of inspectKeys) {
      try {
        const fn = agf[key];
        if (typeof fn === 'function') {
          results[key] = fn();
        }
      } catch(e) {
        results[key] = `ERROR: ${e.message}`;
      }
    }
    return results;
  });

  console.log('\nAGF inspect/render methods:');
  console.log(JSON.stringify(diagResult, null, 2));

  await browser.close();
})();
