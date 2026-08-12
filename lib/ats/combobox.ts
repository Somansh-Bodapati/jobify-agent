import type { Page } from "playwright";

// Common EEOC/demographic phrasing varies a lot across ATS instances even
// when it means the same thing (e.g. "Male" vs "Man") — canonicalize known
// synonym clusters before scoring so matching isn't just literal word overlap.
const SYNONYM_CANON: Record<string, string> = {
  male: "gendermale", man: "gendermale",
  female: "genderfemale", woman: "genderfemale",
  decline: "declinecluster", "don't": "declinecluster", dont: "declinecluster",
  prefer: "declinecluster", disclose: "declinecluster", wish: "declinecluster",
};

function canonicalize(word: string): string {
  return SYNONYM_CANON[word] ?? word;
}

function wordOverlapScore(a: string, b: string): number {
  const wa = new Set(
    a.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean).map(canonicalize)
  );
  const wb = new Set(
    b.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean).map(canonicalize)
  );
  if (wa.size === 0 || wb.size === 0) return 0;
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  // exact (case-insensitive) match gets a strong bonus
  const exact = a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0;
  return exact * 10 + overlap / Math.max(wa.size, wb.size);
}

const MIN_ACCEPT_SCORE = 0.5;

// Runs in Node (Playwright's own selector engine), not in-page — no CSS.escape global here.
function cssEscape(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

/**
 * Opens a click-to-reveal dropdown (native <select> or a react-select-style
 * custom combobox), reads the rendered option text, and clicks whichever
 * option best fuzzy-matches targetText. Returns matched:false (without
 * clicking anything) when no option clears the confidence threshold — the
 * caller should treat that as an unmatched required field, not a guess.
 */
export async function fillCombobox(
  page: Page,
  triggerSelector: string,
  targetText: string
): Promise<{ matched: boolean; selectedText?: string; score?: number }> {
  const trigger = page.locator(triggerSelector).first();

  // Native <select> fast path
  const tagName = await trigger.evaluate((el) => el.tagName.toLowerCase()).catch(() => null);
  if (tagName === "select") {
    const optionTexts = await trigger.locator("option").allTextContents();
    let best = { idx: -1, score: -Infinity };
    optionTexts.forEach((text, idx) => {
      const score = wordOverlapScore(text, targetText);
      if (score > best.score) best = { idx, score };
    });
    if (best.idx === -1 || best.score < MIN_ACCEPT_SCORE) return { matched: false };
    await trigger.selectOption({ index: best.idx });
    return { matched: true, selectedText: optionTexts[best.idx], score: best.score };
  }

  // Custom combobox (react-select style): click to open, optionally type to filter
  await trigger.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(250);

  // Scope the option lookup to this trigger's own listbox (aria-controls) —
  // a page-wide `[role="option"]` selector picks up options from every other
  // select still mounted in the DOM (Greenhouse keeps them around), not just
  // the one we just opened.
  const listboxId = await trigger.getAttribute("aria-controls").catch(() => null);
  const optionsLocator = listboxId ? page.locator(`#${cssEscape(listboxId)} [role="option"]`) : page.locator('[role="option"]');

  let options = await optionsLocator.all();
  if (options.length === 0) {
    await page.keyboard.type(targetText.slice(0, 15), { delay: 15 }).catch(() => {});
    await page.waitForTimeout(300);
    options = await optionsLocator.all();
  }

  if (options.length === 0) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(150);
    return { matched: false };
  }

  let best = { idx: -1, score: -Infinity, text: "" };
  for (let i = 0; i < options.length; i++) {
    const text = (await options[i].innerText().catch(() => "")).trim();
    const score = wordOverlapScore(text, targetText);
    if (score > best.score) best = { idx: i, score, text };
  }

  if (best.idx === -1 || best.score < MIN_ACCEPT_SCORE) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(150);
    return { matched: false };
  }

  await options[best.idx].click({ timeout: 5000 }).catch(() => {});
  // Ensure the dropdown is fully closed before the caller moves to the next
  // field — leaving it open bled state into subsequent combobox fills.
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(150);
  return { matched: true, selectedText: best.text, score: best.score };
}
