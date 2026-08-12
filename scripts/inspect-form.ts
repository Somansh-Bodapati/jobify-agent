/**
 * Fallback form inspector used while @playwright/mcp isn't attached to the
 * running session (newly-added MCP servers need a session restart to load).
 * Navigates to a job application URL with a real (headed-capable) Chromium
 * instance, dumps every visible input/textarea/select/button with its best
 * available label, and screenshots the page for reference.
 *
 * CLI: npx tsx scripts/inspect-form.ts "<url>" "<out-prefix>"
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { dirname } from "path";

const [url, outPrefix] = process.argv.slice(2);
if (!url || !outPrefix) {
  console.error('Usage: tsx scripts/inspect-form.ts "<url>" "<out-prefix>"');
  process.exit(1);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);

  mkdirSync(dirname(outPrefix), { recursive: true });
  await page.screenshot({ path: `${outPrefix}.png`, fullPage: true });

  const fields = await page.evaluate(`(${[
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
    "    const prevText = el.previousElementSibling && el.previousElementSibling.textContent;",
    "    if (prevText) return prevText.trim();",
    '    return "";',
    "  };",
    '  const els = Array.from(document.querySelectorAll("input, textarea, select"));',
    "  return els",
    "    .filter((el) => el.offsetParent !== null)",
    "    .map((el, i) => {",
    "      const tag = el.tagName.toLowerCase();",
    "      const type = el.type || tag;",
    '      const name = el.getAttribute("name") || "";',
    '      const id = el.getAttribute("id") || "";',
    "      return {",
    "        index: i, tag, type, name, id,",
    "        label: labelFor(el),",
    '        required: el.hasAttribute("required"),',
    '        selector: id ? "#" + id : (name ? \'[name="\' + name + \'"]\' : null),',
    "      };",
    "    });",
    "}",
  ].join("\n")})()`);

  console.log(JSON.stringify({ url, screenshot: `${outPrefix}.png`, fields }, null, 2));
  await browser.close();
}

main();
