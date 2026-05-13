import { expect, test } from "@playwright/test";

test("renders a nonblank bootstrap canvas", async ({ page }, testInfo) => {
  await page.goto("/");

  const canvas = page.getByTestId("engine-canvas");
  await expect(canvas).toBeVisible();

  await expect
    .poll(async () =>
      canvas.evaluate((element) => {
        const canvasElement = element as HTMLCanvasElement;
        const context = canvasElement.getContext("2d");

        if (!context || canvasElement.width === 0 || canvasElement.height === 0) {
          return false;
        }

        const sampleWidth = Math.min(canvasElement.width, 128);
        const sampleHeight = Math.min(canvasElement.height, 128);
        const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;

        for (let index = 0; index < pixels.length; index += 4) {
          const red = pixels[index] ?? 0;
          const green = pixels[index + 1] ?? 0;
          const blue = pixels[index + 2] ?? 0;
          const alpha = pixels[index + 3] ?? 0;

          if (alpha > 0 && (red > 0 || green > 0 || blue > 0)) {
            return true;
          }
        }

        return false;
      })
    )
    .toBe(true);

  const screenshotPath = testInfo.outputPath("bootstrap-canvas.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("bootstrap-canvas", {
    path: screenshotPath,
    contentType: "image/png"
  });
});

