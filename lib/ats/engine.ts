import type { Browser } from "playwright";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { detectAtsType, requiresManualApply } from "./detect";
import { detectBlocker } from "./blockers";
import { dismissCookieConsent } from "./cookieConsent";
import { scanFields, fillDetectedFields } from "./generic";
import * as greenhouse from "./greenhouse";
import * as lever from "./lever";
import * as ashby from "./ashby";
import type { FillTarget, JobResult } from "./types";

const NAV_TIMEOUT_MS = 20_000;
const JOB_TIMEOUT_MS = 90_000;
const MAX_FORM_STEPS = 4;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout: ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/** Runs one job application end-to-end: navigate, detect blockers/ATS, fill,
 * screenshot, submit-if-approved. Always closes its browser context, and
 * never lets one stuck job hang the run — everything is timeout-wrapped. */
export async function runJob(browser: Browser, target: FillTarget): Promise<JobResult> {
  const start = Date.now();

  if (requiresManualApply(target.jobUrl)) {
    return { status: "manual_apply_needed", elapsedMs: Date.now() - start, notes: "Non-Greenhouse/Lever/Ashby ATS (Workday or similar) — apply manually." };
  }

  const atsType = target.atsType ?? detectAtsType(target.jobUrl);
  const context = await browser.newContext({ viewport: { width: 1280, height: 2000 } });
  const page = await context.newPage();

  try {
    return await withTimeout(runJobInner(page, atsType, target, start), JOB_TIMEOUT_MS, "job");
  } catch (err) {
    return {
      status: "failed",
      failureReason: "timeout",
      elapsedMs: Date.now() - start,
      notes: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await context.close().catch(() => {});
  }
}

async function runJobInner(
  page: import("playwright").Page,
  atsType: ReturnType<typeof detectAtsType>,
  target: FillTarget,
  start: number
): Promise<JobResult> {
  try {
    // domcontentloaded, not networkidle: bot-detection challenge pages (Cloudflare
    // etc.) poll continuously in the background and never go network-idle, which
    // would otherwise time out navigation before we ever get to detect the wall.
    await page.goto(target.jobUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await page.waitForTimeout(1200);
  } catch {
    return { status: "failed", failureReason: "navigation_error", elapsedMs: Date.now() - start, notes: "navigation failed or timed out" };
  }

  const blocker = await detectBlocker(page);
  if (blocker.blocked) {
    return { status: "failed", failureReason: blocker.reason, elapsedMs: Date.now() - start, notes: blocker.detail };
  }

  await dismissCookieConsent(page);

  if (atsType === "greenhouse") await greenhouse.ensureFormVisible(page);
  else if (atsType === "lever") await lever.ensureFormVisible(page, target.jobUrl);
  else if (atsType === "ashby") await ashby.ensureFormVisible(page);

  // ensureFormVisible may have navigated to a different page (e.g. a
  // Greenhouse embed's own URL) which can carry its own separate cookie
  // banner — dismiss again rather than assuming the first pass covered it.
  await dismissCookieConsent(page);

  const blockerAfterReveal = await detectBlocker(page);
  if (blockerAfterReveal.blocked) {
    return { status: "failed", failureReason: blockerAfterReveal.reason, elapsedMs: Date.now() - start, notes: blockerAfterReveal.detail };
  }

  const allUnmatched: string[] = [];
  let totalFilled = 0;
  let fileUploaded = false;
  let prevSignature = "";

  for (let step = 0; step < MAX_FORM_STEPS; step++) {
    const fields = await scanFields(page);
    const signature = fields.map((f) => f.label).join("|");
    if (step > 0 && signature === prevSignature) {
      return {
        status: "failed",
        failureReason: "form_did_not_progress",
        elapsedMs: Date.now() - start,
        notes: `stuck on step ${step + 1}: field set unchanged after clicking Next`,
      };
    }
    prevSignature = signature;

    if (fields.length === 0 && step === 0) {
      return { status: "failed", failureReason: "unsupported_ats", elapsedMs: Date.now() - start, notes: "no fillable fields detected" };
    }

    const summary = await fillDetectedFields(page, fields, {
      state: target.state,
      resumePdfPath: target.resumePdfPath,
    });
    allUnmatched.push(...summary.unmatchedRequired);
    totalFilled += summary.filled;
    fileUploaded = fileUploaded || summary.fileUploaded;

    const nextButton = page.getByRole("button", { name: /^(next|continue)$/i });
    const hasNext = await nextButton.count().catch(() => 0);
    if (!hasNext) break;
    await nextButton.first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
  }

  mkdirSync(dirname(target.screenshotPath), { recursive: true });
  await page.screenshot({ path: target.screenshotPath, fullPage: true }).catch(() => {});

  const uniqueUnmatched = [...new Set(allUnmatched)];
  if (uniqueUnmatched.length > 0) {
    return {
      status: "ready_for_review",
      screenshotPath: target.screenshotPath,
      unmatchedRequiredFields: uniqueUnmatched,
      notes: `${totalFilled} fields filled, resume ${fileUploaded ? "uploaded" : "NOT uploaded"}. Unmatched required fields need manual review: ${uniqueUnmatched.join("; ")}`,
      elapsedMs: Date.now() - start,
    };
  }

  if (!target.submit) {
    return {
      status: "ready_for_review",
      screenshotPath: target.screenshotPath,
      notes: `${totalFilled} fields filled, resume ${fileUploaded ? "uploaded" : "NOT uploaded"}. Dry run — company not yet approved for real submission.`,
      elapsedMs: Date.now() - start,
    };
  }

  const submitButton = page.getByRole("button", { name: /submit application|submit/i });
  const hasSubmit = await submitButton.count().catch(() => 0);
  if (!hasSubmit) {
    return {
      status: "failed",
      failureReason: "submit_not_confirmed",
      screenshotPath: target.screenshotPath,
      notes: "no submit button found",
      elapsedMs: Date.now() - start,
    };
  }
  await submitButton.first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const confirmationText = await page
    .evaluate("document.body ? document.body.innerText.slice(0, 1500) : \"\"")
    .catch(() => "");
  const confirmed = /thank you|application (has been )?(received|submitted)|we('| ha)ve received your application/i.test(
    String(confirmationText)
  );

  await page.screenshot({ path: target.screenshotPath, fullPage: true }).catch(() => {});

  if (!confirmed) {
    return {
      status: "failed",
      failureReason: "submit_not_confirmed",
      screenshotPath: target.screenshotPath,
      notes: "clicked submit but no confirmation text detected — verify manually",
      elapsedMs: Date.now() - start,
    };
  }

  return {
    status: "submitted",
    screenshotPath: target.screenshotPath,
    notes: `${totalFilled} fields filled, submitted and confirmed`,
    elapsedMs: Date.now() - start,
  };
}
