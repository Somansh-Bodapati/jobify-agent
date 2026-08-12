/**
 * Probes each candidate company's public job-board API — first on its
 * hinted ATS (Greenhouse/Lever/Ashby), then, if that fails, on the other two
 * as a fallback (a wrong initial guess is common and worth catching rather
 * than giving up). "Probe, don't guess": several target companies (Meta,
 * Google, Apple, Microsoft, Netflix, Salesforce, ...) turn out not to be on
 * Greenhouse at all, and Lever/Ashby slug guesses are just as unreliable
 * without a check.
 *
 * A fallback match is flagged needsVerification (logged, not silently
 * trusted) since matching on an unhinted platform carries a small slug-
 * collision risk — the user should eyeball it once before relying on it.
 * Anything that resolves on none of the three platforms is logged too, with
 * next-step guidance, so nothing just silently disappears — this is the
 * "log it and let me verify + restart" loop, not a dead end.
 *
 * Writes logs/validation-fallback-matches.json and
 * logs/validation-unresolved.json (gitignored) each run.
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { prisma } from "../lib/db";
import { fetchWithRetry } from "../lib/fetchRetry";

type Candidate = { name: string; slug: string; careersUrl: string; atsHint?: "greenhouse" | "lever" | "ashby" };
type AtsType = "greenhouse" | "lever" | "ashby";

async function probeGreenhouse(slug: string): Promise<number | null> {
  try {
    const res = await fetchWithRetry(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
    if (!res.ok) return null;
    const data = (await res.json()) as { jobs?: unknown[] };
    return Array.isArray(data.jobs) ? data.jobs.length : null;
  } catch {
    return null;
  }
}

async function probeLever(slug: string): Promise<number | null> {
  try {
    const res = await fetchWithRetry(`https://api.lever.co/v0/postings/${slug}?mode=json`);
    if (!res.ok) return null;
    const data = (await res.json()) as unknown[];
    return Array.isArray(data) ? data.length : null;
  } catch {
    return null;
  }
}

async function probeAshby(slug: string): Promise<number | null> {
  try {
    const res = await fetchWithRetry(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { jobs?: unknown[] };
    return Array.isArray(data.jobs) ? data.jobs.length : null;
  } catch {
    return null;
  }
}

const PROBES: Record<AtsType, (slug: string) => Promise<number | null>> = {
  greenhouse: probeGreenhouse,
  lever: probeLever,
  ashby: probeAshby,
};
const ALL_ATS: AtsType[] = ["greenhouse", "lever", "ashby"];

type Result = {
  name: string;
  slug: string;
  hint: AtsType;
  atsType: AtsType | "unknown";
  valid: boolean;
  jobCount: number | null;
  matchedViaFallback: boolean;
};

async function main() {
  const candidates: Candidate[] = JSON.parse(
    readFileSync(join(process.cwd(), "config/companies.json"), "utf-8")
  );

  const results: Result[] = [];

  for (const c of candidates) {
    const hint = c.atsHint ?? "greenhouse";
    const hintJobCount = await PROBES[hint](c.slug);

    if (hintJobCount !== null && hintJobCount > 0) {
      results.push({ name: c.name, slug: c.slug, hint, atsType: hint, valid: true, jobCount: hintJobCount, matchedViaFallback: false });
    } else {
      // Hint failed — try the other two platforms before giving up.
      let fallbackMatch: { ats: AtsType; jobCount: number } | null = null;
      for (const ats of ALL_ATS.filter((a) => a !== hint)) {
        const jobCount = await PROBES[ats](c.slug);
        if (jobCount !== null && jobCount > 0) {
          fallbackMatch = { ats, jobCount };
          break;
        }
      }
      if (fallbackMatch) {
        results.push({
          name: c.name, slug: c.slug, hint, atsType: fallbackMatch.ats,
          valid: true, jobCount: fallbackMatch.jobCount, matchedViaFallback: true,
        });
      } else {
        results.push({ name: c.name, slug: c.slug, hint, atsType: "unknown", valid: false, jobCount: null, matchedViaFallback: false });
      }
    }

    const last = results[results.length - 1];
    await prisma.company.upsert({
      where: { slug: c.slug },
      update: { name: c.name, careersUrl: c.careersUrl, atsType: last.atsType, active: last.valid },
      create: { name: c.name, slug: c.slug, careersUrl: c.careersUrl, atsType: last.atsType, active: last.valid },
    });
  }

  const byAts = (t: AtsType) => results.filter((r) => r.valid && r.atsType === t);
  const fallbackMatches = results.filter((r) => r.matchedViaFallback);
  const unresolved = results.filter((r) => !r.valid);

  console.log(`\nValidated ${candidates.length} candidates:\n`);
  for (const ats of ALL_ATS) {
    console.log(`${ats} (active):`);
    for (const r of byAts(ats)) {
      console.log(`  ✓ ${r.name} (${r.slug}) — ${r.jobCount} jobs${r.matchedViaFallback ? "  [fallback match, hinted " + r.hint + " — verify this is really the right company]" : ""}`);
    }
  }

  if (unresolved.length > 0) {
    console.log("\nDid not resolve on any platform (marked inactive):");
    for (const r of unresolved) console.log(`  ✗ ${r.name} (${r.slug}, hinted ${r.hint})`);
  }

  const logDir = join(process.cwd(), "logs");
  mkdirSync(logDir, { recursive: true });

  writeFileSync(
    join(logDir, "validation-fallback-matches.json"),
    JSON.stringify(fallbackMatches.map(({ name, slug, hint, atsType, jobCount }) => ({ name, slug, hintedAts: hint, matchedAts: atsType, jobCount })), null, 2)
  );

  writeFileSync(
    join(logDir, "validation-unresolved.json"),
    JSON.stringify(
      unresolved.map(({ name, slug, hint }) => ({
        name,
        slug,
        hintedAts: hint,
        note:
          "Resolved on none of greenhouse/lever/ashby. Likely runs a custom/enterprise ATS (Workday, iCIMS, etc.) with no public API, or the slug is wrong. " +
          `To retry with a corrected slug or a different ATS: npx tsx scripts/manage-companies.ts --add "${name}" "<careers-url>" --ats <greenhouse|lever|ashby>. ` +
          "Then re-run npm run setup (or npx tsx scripts/validate-companies.ts) to pick it up.",
      })),
      null,
      2
    )
  );

  if (fallbackMatches.length > 0) {
    console.log(`\n${fallbackMatches.length} fallback match(es) need verification — see logs/validation-fallback-matches.json`);
  }
  if (unresolved.length > 0) {
    console.log(`${unresolved.length} unresolved — see logs/validation-unresolved.json for next-step guidance per company.`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
