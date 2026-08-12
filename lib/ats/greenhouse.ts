import type { Page } from "playwright";

/** Greenhouse posting pages usually show the application form inline at the
 * bottom already; occasionally an "Apply" button needs a click to reveal it.
 * Some companies (e.g. Databricks) embed the real Greenhouse form in an
 * iframe on their own branded domain instead — our field scanner only reads
 * the top-level page, so when that's the case we navigate directly to the
 * iframe's own URL (a fully valid, directly-loadable Greenhouse page, just
 * reached via the embed) rather than trying to reach into the iframe. */
export async function ensureFormVisible(page: Page): Promise<void> {
  const hasForm = await page.locator("#first_name, #application_form").count().catch(() => 0);
  if (hasForm > 0) return;

  // The embed iframe can still be loading on a heavily-scripted page (ad/
  // tracking tags etc.) — poll for it rather than a single fixed-delay check.
  let embedFrame = page.frames().find((f) => /greenhouse\.io\/embed\/job_app/i.test(f.url()));
  for (let i = 0; i < 6 && !embedFrame; i++) {
    await page.waitForTimeout(500);
    embedFrame = page.frames().find((f) => /greenhouse\.io\/embed\/job_app/i.test(f.url()));
  }
  if (embedFrame) {
    await page.goto(embedFrame.url(), { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
    // Poll for the actual form field rather than a fixed sleep — this page
    // can take a variable amount of time to hydrate.
    await page
      .waitForSelector("#first_name, #application_form", { timeout: 8000 })
      .catch(() => {});
    const hasFormNow = await page.locator("#first_name, #application_form").count().catch(() => 0);
    if (hasFormNow > 0) return;
  }

  const applyButton = page.getByRole("link", { name: /apply/i }).or(page.getByRole("button", { name: /apply/i }));
  if (await applyButton.count().catch(() => 0)) {
    await applyButton.first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);
  }
}
