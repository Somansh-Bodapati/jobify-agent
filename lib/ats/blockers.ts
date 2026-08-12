import type { Page } from "playwright";
import type { FailureReason } from "./types";

const BOT_WALL_MARKERS = [
  /verify you are human/i,
  /checking your browser/i,
  /performing security verification/i,
  /attention required.*cloudflare/i,
  /captcha/i,
];

/**
 * Checks for bot-detection walls or account-required gates before any fill is
 * attempted. Never tries to solve or bypass what it finds — just reports it so
 * the caller can record failed/manual_apply_needed and move to the next job.
 */
export async function detectBlocker(
  page: Page
): Promise<{ blocked: boolean; reason?: FailureReason; detail?: string }> {
  const bodyText = await page.evaluate("document.body ? document.body.innerText.slice(0, 2000) : \"\"").catch(
    () => ""
  );
  const text = String(bodyText);

  if (BOT_WALL_MARKERS.some((re) => re.test(text))) {
    return { blocked: true, reason: "bot_detection", detail: "bot-wall text marker found" };
  }

  // Only flag an *interactive* challenge (hCaptcha, or reCAPTCHA's actual
  // checkbox/challenge iframe). Deliberately excludes reCAPTCHA v3's invisible
  // corner badge (`.grecaptcha-badge`, the `.../recaptcha/api2/anchor` iframe) —
  // that's a frictionless, non-blocking background check present on tons of
  // ordinary forms (Greenhouse included) and must not be treated as a wall.
  const hasInteractiveCaptcha = await page
    .locator(
      '.h-captcha, iframe[src*="hcaptcha.com" i], iframe[src*="recaptcha/api2/bframe" i], iframe[title*="challenge" i]'
    )
    .count()
    .catch(() => 0);
  if (hasInteractiveCaptcha > 0) {
    return { blocked: true, reason: "bot_detection", detail: "interactive captcha challenge present" };
  }

  const hasPasswordField = await page.locator('input[type="password"]').count().catch(() => 0);
  if (hasPasswordField > 0) {
    return { blocked: true, reason: "requires_account", detail: "password field present" };
  }

  return { blocked: false };
}
