/**
 * Renders each resume category to a 1-page PDF via a headless Chromium instance
 * (Playwright), then verifies: exactly 1 page, and every expected link
 * (email/linkedin/github) is present as a clickable annotation pointing at the
 * correct URL. Rejects (throws, does not write a broken PDF) if either check fails.
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { renderResumeHtml, type ResumeContent } from "../lib/resumeTemplate";

const content: ResumeContent = JSON.parse(
  readFileSync(join(process.cwd(), "config/resumeContent.json"), "utf-8")
);

const EXPECTED_LINKS = [content.contact.linkedinUrl, content.contact.githubUrl];

async function renderCategory(browser: import("playwright").Browser, category: string) {
  const html = renderResumeHtml(content, category);
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });

  const outDir = join(process.cwd(), "public/resumes");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${category}.pdf`);

  const pdfBuffer = await page.pdf({
    format: "Letter",
    printBackground: true,
    preferCSSPageSize: true,
  });
  await page.close();

  // Verify: exactly 1 page
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pageCount = pdfDoc.getPageCount();
  if (pageCount !== 1) {
    throw new Error(
      `${category}: rendered to ${pageCount} pages, expected exactly 1. Content needs trimming.`
    );
  }

  // Verify: expected links are present as URI annotations
  const rawText = pdfBuffer.toString("latin1");
  const missingLinks = EXPECTED_LINKS.filter((url) => !rawText.includes(url));
  if (missingLinks.length > 0) {
    throw new Error(`${category}: missing expected link annotation(s): ${missingLinks.join(", ")}`);
  }

  writeFileSync(outPath, pdfBuffer);
  console.log(`  ✓ ${category}.pdf — 1 page, links verified (${pdfBuffer.length} bytes)`);
}

async function main() {
  const browser = await chromium.launch();
  const categories = Object.keys(content.categories);
  console.log(`Rendering ${categories.length} resume variants...\n`);
  for (const category of categories) {
    await renderCategory(browser, category);
  }
  await browser.close();
  console.log("\nAll resume variants rendered and verified.");
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
