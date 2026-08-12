import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { Browser } from "playwright";
import { PDFDocument } from "pdf-lib";
import { renderResumeHtml, type ResumeContent } from "./resumeTemplate";

/**
 * Renders a ResumeContent (already category-resolved / bullet-reordered by
 * the caller) to a verified 1-page PDF at outPath. Throws — never writes a
 * broken PDF — if the page count isn't exactly 1 or an expected link
 * annotation is missing, so callers can catch and fall back to the static
 * pre-built category PDF instead.
 */
export async function renderAndVerifyResume(
  browser: Browser,
  content: ResumeContent,
  category: string,
  outPath: string
): Promise<{ bytes: number }> {
  const html = renderResumeHtml(content, category);
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });

  const pdfBuffer = await page.pdf({ format: "Letter", printBackground: true, preferCSSPageSize: true });
  await page.close();

  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pageCount = pdfDoc.getPageCount();
  if (pageCount !== 1) {
    throw new Error(`${category}: rendered to ${pageCount} pages, expected exactly 1`);
  }

  const expectedLinks = [content.contact.linkedinUrl, content.contact.githubUrl];
  const rawText = pdfBuffer.toString("latin1");
  const missingLinks = expectedLinks.filter((url) => !rawText.includes(url));
  if (missingLinks.length > 0) {
    throw new Error(`${category}: missing expected link annotation(s): ${missingLinks.join(", ")}`);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, pdfBuffer);
  return { bytes: pdfBuffer.length };
}
