import type { Page } from "playwright";

/**
 * Dismisses a cookie-consent banner if one is blocking the page, choosing
 * the privacy-preserving option (decline non-essential) whenever offered —
 * only falls back to "accept" when the banner gives no other way to proceed
 * (some implementations force a choice before the page becomes interactive).
 */
export async function dismissCookieConsent(page: Page): Promise<void> {
  const rejectButton = page.getByRole("button", {
    name: /reject all|decline all|reject non-essential|decline optional|only necessary|necessary only/i,
  });
  if (await rejectButton.count().catch(() => 0)) {
    await rejectButton.first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(300);
    return;
  }

  const acceptButton = page.getByRole("button", {
    name: /accept all|accept cookies|^accept$|i agree|got it|allow all/i,
  });
  if (await acceptButton.count().catch(() => 0)) {
    await acceptButton.first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
}
