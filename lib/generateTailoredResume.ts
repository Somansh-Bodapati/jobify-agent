import { readFileSync } from "fs";
import { join } from "path";
import type { Browser } from "playwright";
import type { ResumeContent } from "./resumeTemplate";
import { tailorContentForJob } from "./resumeTailor";
import { renderAndVerifyResume } from "./resumeRender";

const MAX_DROP_ATTEMPTS = 3; // 0, 1, 2 lowest-relevance bullets dropped per subsection

/**
 * Generates a per-job tailored resume PDF: reorders (never rewrites) bullets
 * by relevance to the job's title/description, renders, and verifies (1
 * page + links intact). If content overflows a page, retries with
 * progressively more of the lowest-relevance bullets trimmed per subsection
 * — a bounded render-measure-trim loop, not an open-ended one. Throws if it
 * still doesn't fit after MAX_DROP_ATTEMPTS; the caller should catch and
 * fall back to the static pre-built category PDF.
 */
export async function generateTailoredResume(
  browser: Browser,
  category: string,
  jobTitle: string,
  jobDescription: string,
  outPath: string
): Promise<{ bytes: number; bulletsDropped: number }> {
  const content: ResumeContent = JSON.parse(
    readFileSync(join(process.cwd(), "config/resumeContent.json"), "utf-8")
  );

  let lastError: unknown;
  for (let drop = 0; drop < MAX_DROP_ATTEMPTS; drop++) {
    const tailored = tailorContentForJob(content, jobTitle, jobDescription, {
      maxBulletsToDropPerSubsection: drop,
    });
    try {
      const result = await renderAndVerifyResume(browser, tailored, category, outPath);
      return { bytes: result.bytes, bulletsDropped: drop };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
