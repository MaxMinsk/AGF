/**
 * Shadow check runner for Kaboom Crew
 * Uses window.__agf pattern (same as e2e specs) to detect game ready state.
 */
import { chromium } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_PATH = join(__dirname, 'shadow-check-2026-06-04.png');
const FAIL_SCREENSHOT_PATH = join(__dirname, 'shadow-check-2026-06-04-FAIL.png');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-web-security']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // Collect console messages
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
    // Print immediately so we see errors in real time
    if (msg.type() === 'error' || msg.type() === 'warning') {
      process.stdout.write(`  [BROWSER ${msg.type()}] ${msg.text()}\n`);
    }
  });
  page.on('pageerror', err => {
    consoleLogs.push({ type: 'pageerror', text: err.message });
    process.stdout.write(`  [PAGE ERROR] ${err.message}\n`);
  });

  console.log('[shadow-check] Navigating to game...');
  try {
    await page.goto('http://localhost:5173/?project=kaboom-crew', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
  } catch (e) {
    console.error('[shadow-check] Navigation failed:', e.message);
    await page.screenshot({ path: FAIL_SCREENSHOT_PATH });
    await browser.close();
    process.exit(1);
  }

  console.log('[shadow-check] Page loaded, polling for window.__agf...');

  // Poll manually with short intervals and print status
  let agfReady = false;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000);
    const ready = await page.evaluate(() => Boolean(window.__agf)).catch(() => false);
    if (ready) {
      agfReady = true;
      console.log(`[shadow-check] window.__agf became available after ~${i+1}s`);
      break;
    }
    // Check what's on the page
    const pageInfo = await page.evaluate(() => ({
      title: document.title,
      bodyContent: document.body.innerHTML.slice(0, 200),
      hasCanvas: !!document.querySelector('canvas'),
      agfType: typeof window.__agf
    })).catch(e => ({ error: e.message }));
    console.log(`[shadow-check] t+${i+1}s: canvas=${pageInfo.hasCanvas}, agfType=${pageInfo.agfType}`);
    if (i === 4) {
      // Grab a mid-load screenshot
      await page.screenshot({ path: FAIL_SCREENSHOT_PATH.replace('FAIL', 'midload') });
      console.log('[shadow-check] Mid-load screenshot saved');
    }
  }

  if (!agfReady) {
    console.error('[shadow-check] TIMEOUT: window.__agf never became available');
    await page.screenshot({ path: FAIL_SCREENSHOT_PATH });
    console.log(`[shadow-check] Failure screenshot: ${FAIL_SCREENSHOT_PATH}`);

    // Print all console logs
    console.log('\n=== BROWSER CONSOLE LOGS ===');
    for (const entry of consoleLogs) {
      console.log(`[${entry.type}] ${entry.text}`);
    }
    await browser.close();
    process.exit(1);
  }

  // Extra settle time
  await page.waitForTimeout(1000);

  // Press Space to dismiss title screen
  console.log('[shadow-check] Pressing Space (dismiss title screen)...');
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })));
  await page.waitForTimeout(80);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true })));
  await page.waitForTimeout(2500);

  // Take screenshot
  console.log('[shadow-check] Taking screenshot...');
  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
  console.log(`[shadow-check] Screenshot saved: ${SCREENSHOT_PATH}`);

  await browser.close();

  // Print all console logs
  console.log('\n=== BROWSER CONSOLE LOGS ===');
  for (const entry of consoleLogs) {
    console.log(`[${entry.type}] ${entry.text}`);
  }
  console.log('=== END CONSOLE LOGS ===\n');

  console.log('[shadow-check] Done.');
})();
