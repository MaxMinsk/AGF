import { expect, test } from "@playwright/test";

test("renders a nonblank Three.js canvas", async ({ page }, testInfo) => {
  await page.goto("/");

  const canvas = page.getByTestId("engine-canvas");
  await expect(canvas).toBeVisible();

  // Codex review (S43): block on `window.__agf.rendererReady` before pixel
  // sampling. Without this guard the poll runs against a black canvas on
  // first frame and either flakes (intermittent timeout) or stalls the GPU
  // by issuing readbacks before the first scene draw lands.
  await page.waitForFunction(
    () => Boolean((window as unknown as { __agf?: { rendererReady?: Promise<unknown> } }).__agf?.rendererReady),
    undefined,
    { timeout: 10_000 }
  );
  await page.evaluate(
    async () => {
      const surface = (window as unknown as { __agf?: { rendererReady?: Promise<unknown> } }).__agf;
      await surface?.rendererReady;
    }
  );

  await expect
    .poll(async () =>
      canvas.evaluate((element) => {
        const canvasElement = element as HTMLCanvasElement;
        if (canvasElement.width === 0 || canvasElement.height === 0) {
          return false;
        }

        const sampleWidth = Math.min(canvasElement.width, 256);
        const sampleHeight = Math.min(canvasElement.height, 256);

        const sampler = document.createElement("canvas");
        sampler.width = sampleWidth;
        sampler.height = sampleHeight;
        const samplerContext = sampler.getContext("2d");
        if (!samplerContext) {
          return false;
        }

        samplerContext.drawImage(canvasElement, 0, 0, sampleWidth, sampleHeight);
        const pixels = samplerContext.getImageData(0, 0, sampleWidth, sampleHeight).data;

        const reference = { red: pixels[0] ?? 0, green: pixels[1] ?? 0, blue: pixels[2] ?? 0 };
        for (let index = 0; index < pixels.length; index += 4) {
          const red = pixels[index] ?? 0;
          const green = pixels[index + 1] ?? 0;
          const blue = pixels[index + 2] ?? 0;
          const alpha = pixels[index + 3] ?? 0;
          if (alpha === 0) {
            continue;
          }
          if (
            Math.abs(red - reference.red) > 5 ||
            Math.abs(green - reference.green) > 5 ||
            Math.abs(blue - reference.blue) > 5
          ) {
            return true;
          }
        }
        return false;
      })
    )
    .toBe(true);

  const screenshotPath = testInfo.outputPath("hello-3d-canvas.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("hello-3d-canvas", {
    path: screenshotPath,
    contentType: "image/png"
  });
});
