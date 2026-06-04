/**
 * Shadow check runner v2 - waits for playing phase before screenshot
 */
import { chromium } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_PATH = join(__dirname, 'shadow-check-2026-06-04.png');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
    if (msg.type() === 'error' || msg.type() === 'warning') {
      process.stdout.write(`  [BROWSER ${msg.type()}] ${msg.text()}\n`);
    }
  });
  page.on('pageerror', err => {
    consoleLogs.push({ type: 'pageerror', text: err.message });
    process.stdout.write(`  [PAGE ERROR] ${err.message}\n`);
  });

  console.log('[shadow-check] Navigating...');
  await page.goto('http://localhost:5173/?project=kaboom-crew', {
    waitUntil: 'domcontentloaded', timeout: 30000
  });

  console.log('[shadow-check] Waiting for window.__agf...');
  await page.waitForFunction(() => Boolean(window.__agf), undefined, { timeout: 25000 });
  console.log('[shadow-check] __agf ready');
  await page.waitForTimeout(1000);

  // Check current game phase
  const phase1 = await page.evaluate(() => {
    const snap = window.__agf.snapshot();
    const gs = snap.entities.find(e => e.id === 'kaboom.game-state');
    return gs?.components ?? null;
  });
  console.log('[shadow-check] Game state before Space:', JSON.stringify(phase1));

  // Send Space to dismiss title screen
  console.log('[shadow-check] Space #1 (dismiss title overlay)...');
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })));
  await page.waitForTimeout(100);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true })));
  await page.waitForTimeout(500);

  // Check phase again
  const phase2 = await page.evaluate(() => {
    const snap = window.__agf.snapshot();
    const gs = snap.entities.find(e => e.id === 'kaboom.game-state');
    return gs?.components ?? null;
  });
  console.log('[shadow-check] Game state after first Space:', JSON.stringify(phase2));

  // If still on title/lobby, send another Space
  const matchState2 = phase2?.MatchState;
  if (matchState2?.phase !== 'playing') {
    console.log('[shadow-check] Space #2 (start round)...');
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })));
    await page.waitForTimeout(100);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true })));
    await page.waitForTimeout(2000);
  }

  // Wait for 'playing' phase
  try {
    await page.waitForFunction(() => {
      const snap = window.__agf.snapshot();
      const gs = snap.entities.find(e => e.id === 'kaboom.game-state');
      const ms = gs?.components?.MatchState;
      return ms?.phase === 'playing';
    }, undefined, { timeout: 8000 });
    console.log('[shadow-check] Phase = playing');
  } catch (e) {
    // Get current state for diagnosis
    const phase3 = await page.evaluate(() => {
      const snap = window.__agf.snapshot();
      const gs = snap.entities.find(e => e.id === 'kaboom.game-state');
      return gs?.components ?? null;
    });
    console.log('[shadow-check] Phase timeout, current state:', JSON.stringify(phase3));
    console.log('[shadow-check] Proceeding with screenshot anyway...');
  }

  // Let rendering settle
  await page.waitForTimeout(1500);

  console.log('[shadow-check] Taking screenshot...');
  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
  console.log(`[shadow-check] Screenshot: ${SCREENSHOT_PATH}`);

  // Snapshot analysis
  const analysis = await page.evaluate(() => {
    const snap = window.__agf.snapshot();
    const shadowCasters = snap.entities.filter(e => 'ShadowCaster' in (e.components ?? {}));
    const shadowReceivers = snap.entities.filter(e => 'ShadowReceiver' in (e.components ?? {}));
    const lights = snap.entities.filter(e =>
      'Light' in (e.components ?? {}) || 'DirectionalLight' in (e.components ?? {})
    );
    const gs = snap.entities.find(e => e.id === 'kaboom.game-state');
    const bombs = snap.entities.filter(e => e.id.startsWith('bomb.'));
    return {
      totalEntities: snap.entities.length,
      shadowCasters: shadowCasters.length,
      shadowReceivers: shadowReceivers.length,
      lights: lights.map(e => ({ id: e.id, comps: e.components })),
      matchState: gs?.components ?? null,
      bombs: bombs.map(e => e.id),
    };
  });
  console.log('\n[shadow-check] === SNAPSHOT ANALYSIS ===');
  console.log(JSON.stringify(analysis, null, 2));

  await browser.close();

  console.log('\n=== BROWSER CONSOLE LOGS (warnings/errors) ===');
  for (const entry of consoleLogs) {
    if (entry.type === 'error' || entry.type === 'warning' || entry.type === 'pageerror' ||
        /shadow|castShadow|light/i.test(entry.text)) {
      console.log(`[${entry.type}] ${entry.text}`);
    }
  }
  console.log('[shadow-check] Done.');
})();
