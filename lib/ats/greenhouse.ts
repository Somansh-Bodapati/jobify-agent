import type { Page } from "playwright";

/** Greenhouse posting pages usually show the application form inline at the
 * bottom already; occasionally an "Apply" button needs a click to reveal it. */
export async function ensureFormVisible(page: Page): Promise<void> {
  const hasForm = await page.locator("#first_name, #application_form").count().catch(() => 0);
  if (hasForm > 0) return;

  const applyButton = page.getByRole("link", { name: /apply/i }).or(page.getByRole("button", { name: /apply/i }));
  if (await applyButton.count().catch(() => 0)) {
    await applyButton.first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);
  }
}
