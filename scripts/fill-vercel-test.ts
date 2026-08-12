/** One-off proof-of-concept fill for the Vercel test job — demonstrates the full
 * match-question -> Playwright fill -> screenshot pipeline against a real
 * Greenhouse form. Does NOT click submit (Vercel is not in run-state approvedCompanies). */
import { chromium } from "playwright";
import { loadProfile } from "../lib/profile";
import { matchQuestion } from "../lib/matchQuestion";
import { join } from "path";

async function main() {
  const profile = loadProfile();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 2400 } });
  await page.goto("https://job-boards.greenhouse.io/vercel/jobs/5752684004", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(1000);

  await page.fill("#first_name", String(profile.firstName));
  await page.fill("#last_name", String(profile.lastName));
  await page.fill("#email", String(profile.email));
  await page.fill("#phone", String(profile.phone));

  // Country field is a react-select combobox
  await page.click("#country");
  await page.keyboard.type("United States", { delay: 30 });
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");

  // Resume upload
  const resumePath = join(process.cwd(), "public/resumes/software-engineer.pdf");
  await page.setInputFiles("#resume", resumePath);
  await page.waitForTimeout(1000);

  // LinkedIn / Github free-text questions
  const linkedin = matchQuestion("LinkedIn Profile", {}, profile);
  const github = matchQuestion("Github", {}, profile);
  if (linkedin.kind === "field") await page.fill("#question_14990395004", String(linkedin.value));
  if (github.kind === "field") await page.fill("#question_14990398004", String(github.value));

  // Visa sponsorship react-select
  const visa = matchQuestion("Will you require Visa Sponsorship now, or in the future?", {}, profile);
  await page.click("#question_14990392004");
  await page.waitForTimeout(300);
  await page.keyboard.type("Yes, I will need sponsorship in the future", { delay: 20 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape"); // don't force a wrong option pick in this proof run

  await page.screenshot({ path: "public/screenshots/vercel/test1-filled.png", fullPage: true });
  console.log("Filled fields (sample):", { linkedin, github, visaResolved: visa });
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
