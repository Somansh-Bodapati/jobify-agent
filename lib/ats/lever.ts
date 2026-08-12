import type { Page } from "playwright";

/** Lever postings usually need a click on "Apply for this job", which either
 * reveals an inline form or navigates to `<postingUrl>/apply`. */
export async function ensureFormVisible(page: Page, jobUrl: string): Promise<void> {
  const hasForm = await page.locator('input[name="name"], input[name="email"]').count().catch(() => 0);
  if (hasForm > 0) return;

  const applyButton = page.getByRole("link", { name: /apply for this job/i }).or(
    page.getByRole("button", { name: /apply for this job/i })
  );
  if (await applyButton.count().catch(() => 0)) {
    await applyButton.first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);
    const hasFormNow = await page.locator('input[name="name"], input[name="email"]').count().catch(() => 0);
    if (hasFormNow > 0) return;
  }

  // Common Lever pattern: the apply form lives at <postingUrl>/apply
  const applyUrl = jobUrl.replace(/\/$/, "") + "/apply";
  await page.goto(applyUrl, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
}
