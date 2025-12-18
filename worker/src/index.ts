import { chromium } from "playwright";

async function main(): Promise<void> {
  console.log("Worker starting...");

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto("https://chrisjarling.com");
  const title = await page.title();
  console.log("Page title:", title);

  await browser.close();
  console.log("Worker finished.");
}

main().catch((error) => {
  console.error("Worker error:", error);
  process.exit(1);
});
