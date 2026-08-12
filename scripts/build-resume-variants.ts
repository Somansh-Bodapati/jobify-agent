/**
 * Renders each resume category to a 1-page PDF via a headless Chromium instance
 * (Playwright), then verifies: exactly 1 page, and every expected link
 * (email/linkedin/github) is present as a clickable annotation pointing at the
 * correct URL. Rejects (throws, does not write a broken PDF) if either check fails.
 *
 * These are the static, default-order category PDFs used as the safe
 * fallback when per-job tailoring (lib/generateTailoredResume.ts) isn't
 * available or fails its own verification.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { chromium } from "playwright";
import type { ResumeContent } from "../lib/resumeTemplate";
import { renderAndVerifyResume } from "../lib/resumeRender";

const content: ResumeContent = JSON.parse(
  readFileSync(join(process.cwd(), "config/resumeContent.json"), "utf-8")
);

async function main() {
  const browser = await chromium.launch();
  const categories = Object.keys(content.categories);
  console.log(`Rendering ${categories.length} resume variants...\n`);
  for (const category of categories) {
    const outPath = join(process.cwd(), "public/resumes", `${category}.pdf`);
    const { bytes } = await renderAndVerifyResume(browser, content, category, outPath);
    console.log(`  ✓ ${category}.pdf — 1 page, links verified (${bytes} bytes)`);
  }
  await browser.close();
  console.log("\nAll resume variants rendered and verified.");
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
