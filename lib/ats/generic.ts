import type { Page } from "playwright";
import type { DetectedField } from "./types";
import { matchQuestion, type SalaryFieldKind } from "../matchQuestion";
import { fillCombobox } from "./combobox";

/**
 * Scans the current page for fillable fields. Runs as a stringified function
 * (not a closure) passed to page.evaluate — tsx/esbuild injects a `__name`
 * helper for closures that Playwright can't resolve when serializing just the
 * function body, so this must stay a plain evaluated string. See
 * scripts/inspect-form.ts from the prior session for the same workaround.
 */
export async function scanFields(page: Page): Promise<DetectedField[]> {
  const raw = await page.evaluate(`(${[
    "() => {",
    '  const labelFor = (el) => {',
    '    const id = el.getAttribute("id");',
    "    if (id) {",
    '      const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);',
    "      if (lbl && lbl.textContent) return lbl.textContent.trim();",
    "    }",
    '    const wrappingLabel = el.closest("label");',
    "    if (wrappingLabel && wrappingLabel.textContent) return wrappingLabel.textContent.trim();",
    '    const aria = el.getAttribute("aria-label");',
    "    if (aria) return aria;",
    '    const fieldset = el.closest("fieldset");',
    '    const legend = fieldset && fieldset.querySelector("legend");',
    "    if (legend && legend.textContent) return legend.textContent.trim();",
    "    const prevText = el.previousElementSibling && el.previousElementSibling.textContent;",
    "    if (prevText) return prevText.trim();",
    '    return "";',
    "  };",
    '  const selectorFor = (el) => {',
    '    const id = el.getAttribute("id");',
    '    if (id) return "#" + CSS.escape(id);',
    '    const name = el.getAttribute("name");',
    '    return name ? `[name="${name}"]` : null;',
    "  };",
    '  const isVisible = (el) => el.offsetParent !== null;',
    "",
    "  const results = [];",
    "  const seenGroups = new Set();",
    '  const els = Array.from(document.querySelectorAll("input, textarea, select"));',
    "  for (const el of els) {",
    "    if (!isVisible(el)) continue;",
    '    const tag = el.tagName.toLowerCase();',
    '    const type = el.type || tag;',
    '    const required = el.hasAttribute("required") || el.getAttribute(\"aria-required\") === \"true\";',
    "",
    '    if (type === "radio" || type === "checkbox") {',
    '      const name = el.getAttribute("name") || el.getAttribute("id") || "";',
    '      const groupKey = "group:" + name;',
    "      if (seenGroups.has(groupKey)) continue;",
    "      seenGroups.add(groupKey);",
    '      const groupEls = els.filter((e) => (e.getAttribute("name") || "") === name && (e.type === "radio" || e.type === "checkbox"));',
    "      const groupOptions = groupEls.map((e) => ({ selector: selectorFor(e), label: labelFor(e) }));",
    '      const fieldset = el.closest("fieldset");',
    '      const legend = fieldset && fieldset.querySelector("legend");',
    '      const groupLabel = (legend && legend.textContent && legend.textContent.trim()) || labelFor(el) || name;',
    "      results.push({",
    "        label: groupLabel, kind: type, selector: selectorFor(el), required,",
    "        groupOptions: groupOptions.filter((g) => g.selector),",
    "      });",
    "      continue;",
    "    }",
    "",
    '    if (tag === "select") {',
    '      results.push({ label: labelFor(el), kind: "select", selector: selectorFor(el), required });',
    "      continue;",
    "    }",
    '    if (type === "file") {',
    '      results.push({ label: labelFor(el), kind: "file", selector: selectorFor(el), required });',
    "      continue;",
    "    }",
    '    if (tag === "textarea") {',
    '      results.push({ label: labelFor(el), kind: "textarea", selector: selectorFor(el), required });',
    "      continue;",
    "    }",
    "",
    "    // text-like input: decide plain text vs a react-select style combobox trigger",
    '    const hasPopup = el.getAttribute("aria-haspopup") === "listbox" || el.getAttribute("aria-autocomplete") === "list";',
    '    const nearSelectClass = el.closest(\'[class*="select__" i], [class*="-select" i], [class*="select-" i]\') !== null;',
    '    const fieldId = el.getAttribute("id") || "";',
    '    const looksLikeCombo = hasPopup || el.readOnly || nearSelectClass || /^(country|location)$/.test(fieldId) || /^question_\\d+$/.test(fieldId) || /^\\d+$/.test(fieldId);',
    "    results.push({",
    '      label: labelFor(el), kind: looksLikeCombo ? "combobox" : "text",',
    "      selector: selectorFor(el), required,",
    "    });",
    "  }",
    "",
    "  // Button-group Yes/No or pill-style choice questions (Ashby and others render",
    "  // these as plain <button> pairs, not native radio inputs — invisible above).",
    '  const EXCLUDED_BUTTON_TEXT = /^(submit application|submit|next|continue|apply|apply for this job|back|upload|upload file|attach|browse|choose file|dropbox|google drive|enter manually|replace)$/i;',
    '  const candidateButtons = Array.from(document.querySelectorAll("button")).filter((b) => {',
    "    if (!isVisible(b)) return false;",
    '    const text = (b.textContent || "").trim();',
    "    if (!text || text.length > 30) return false;",
    "    if (EXCLUDED_BUTTON_TEXT.test(text)) return false;",
    "    return true;",
    "  });",
    "  const byParent = new Map();",
    "  for (const b of candidateButtons) {",
    "    const parent = b.parentElement;",
    "    if (!parent) continue;",
    "    if (!byParent.has(parent)) byParent.set(parent, []);",
    "    byParent.get(parent).push(b);",
    "  }",
    "  let btnIdx = 0;",
    "  for (const [parent, btns] of byParent) {",
    "    if (btns.length < 2) continue;",
    '    let label = "";',
    "    let hop = parent;",
    "    for (let i = 0; i < 4 && !label && hop; i++) {",
    "      const prev = hop.previousElementSibling;",
    "      if (prev && prev.textContent && prev.textContent.trim()) { label = prev.textContent.trim(); break; }",
    "      hop = hop.parentElement;",
    "    }",
    "    const groupOptions = btns.map((b) => {",
    "      const idx = btnIdx++;",
    '      b.setAttribute("data-jobify-idx", String(idx));',
    '      return { selector: `[data-jobify-idx="${idx}"]`, label: (b.textContent || "").trim() };',
    "    });",
    "    results.push({",
    '      label: label || "button choice", kind: "radio", selector: groupOptions[0].selector, required: false,',
    "      groupOptions,",
    "    });",
    "  }",
    "",
    "  return results.filter((r) => r.selector);",
    "}",
  ].join("\n")})()`);

  return raw as DetectedField[];
}

export type FillSummary = {
  filled: number;
  unmatchedRequired: string[];
  fileUploaded: boolean;
};

/**
 * Fills every detected field it can confidently resolve via matchQuestion/
 * fillCombobox. Never guesses on an unmatched required field — those are
 * collected and returned so the caller can flag the application for review
 * instead of submitting it.
 */
export async function fillDetectedFields(
  page: Page,
  fields: DetectedField[],
  opts: { state?: string; resumePdfPath: string }
): Promise<FillSummary> {
  const unmatchedRequired: string[] = [];
  let filled = 0;
  let fileUploaded = false;

  for (const field of fields) {
    try {
      if (field.kind === "file") {
        // Only the resume/CV field gets the resume uploaded — never guess on
        // cover-letter or other file fields we don't have a document for.
        const isResumeField = /resum|cv\b/i.test(field.label) || /resum/i.test(field.selector);
        if (!isResumeField) {
          if (field.required) unmatchedRequired.push(field.label);
          continue;
        }
        await page.setInputFiles(field.selector, opts.resumePdfPath, { timeout: 5000 });
        fileUploaded = true;
        filled++;
        continue;
      }

      if (field.kind === "select" || field.kind === "combobox") {
        const salaryKind: SalaryFieldKind = field.kind === "select" ? "range_selector" : "free_text";
        const match = matchQuestion(field.label, { state: opts.state, salaryFieldKind: salaryKind });
        const target = match.kind === "field" ? match.comboboxHint : match.kind === "salary" ? match.value : null;
        if (target === null) {
          if (field.required) unmatchedRequired.push(field.label);
          continue;
        }
        const result = await fillCombobox(page, field.selector, target);
        if (result.matched) filled++;
        else if (field.required) unmatchedRequired.push(field.label);
        continue;
      }

      if (field.kind === "radio" || field.kind === "checkbox") {
        const match = matchQuestion(field.label, { state: opts.state });
        const target = match.kind === "field" ? String(match.comboboxHint) : match.kind === "salary" ? match.value : null;
        if (target === null || !field.groupOptions?.length) {
          if (field.required) unmatchedRequired.push(field.label);
          continue;
        }
        let best = { idx: -1, score: -Infinity };
        field.groupOptions.forEach((opt, idx) => {
          const score = wordOverlap(opt.label, target);
          if (score > best.score) best = { idx, score };
        });
        if (best.idx === -1 || best.score < 0.5) {
          if (field.required) unmatchedRequired.push(field.label);
          continue;
        }
        await page.click(field.groupOptions[best.idx].selector, { timeout: 5000 }).catch(() => {});
        filled++;
        continue;
      }

      // text / textarea
      const match = matchQuestion(field.label, { state: opts.state, salaryFieldKind: "free_text" });
      const value =
        match.kind === "field" ? String(match.value) : match.kind === "salary" ? match.value : null;
      if (value === null) {
        if (field.required) unmatchedRequired.push(field.label);
        continue;
      }
      await page.fill(field.selector, value, { timeout: 5000 });
      filled++;
    } catch {
      if (field.required) unmatchedRequired.push(field.label);
    }
  }

  return { filled, unmatchedRequired, fileUploaded };
}

function wordOverlap(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const wb = new Set(b.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  if (wa.size === 0 || wb.size === 0) return 0;
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  return overlap / Math.max(wa.size, wb.size);
}
