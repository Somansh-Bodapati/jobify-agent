import type { Page } from "playwright";

/** Ashby job postings often embed the application form directly on the page
 * behind an "Apply for this job" button that reveals a form section. */
export async function ensureFormVisible(page: Page): Promise<void> {
  const hasForm = await page.locator('input[type="email"], input[name*="name" i]').count().catch(() => 0);
  if (hasForm > 0) return;

  const applyButton = page.getByRole("button", { name: /apply for this job|apply now/i });
  if (await applyButton.count().catch(() => 0)) {
    await applyButton.first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);
  }
}
