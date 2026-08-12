import { readFileSync } from "fs";
import { join } from "path";
import { chromium } from "playwright";
import { renderResumeHtml, type ResumeContent } from "../lib/resumeTemplate";

const content: ResumeContent = JSON.parse(
  readFileSync(join(process.cwd(), "config/resumeContent.json"), "utf-8")
);
const category = process.argv[2] ?? "software-engineer";

async function main() {
  const html = renderResumeHtml(content, category);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 850, height: 1100 } });
  await page.setContent(html, { waitUntil: "networkidle" });
  const outPath = join(process.cwd(), "resumes/preview", `${category}.png`);
  await page.screenshot({ path: outPath, fullPage: true });
  await browser.close();
  console.log(outPath);
}
main();
