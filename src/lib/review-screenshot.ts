import { chromium } from "playwright";

export async function captureReviewScreenshot(input: { url: string }) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
    await page.goto(input.url, { waitUntil: "networkidle", timeout: 30000 });
    return await page.screenshot({ type: "png", fullPage: true });
  } finally {
    await browser.close();
  }
}
