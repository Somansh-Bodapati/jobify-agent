/**
 * Probes each candidate company's public job-board API on its hinted ATS
 * (Greenhouse/Lever/Ashby) and keeps only the ones that actually resolve —
 * "probe, don't guess": several target companies (Meta, Google, Apple,
 * Microsoft, Netflix, Salesforce, ...) turn out not to be on Greenhouse at
 * all, and Lever/Ashby slug guesses are just as unreliable without a check.
 * Seeds/updates the Company table accordingly.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "../lib/db";

type Candidate = { name: string; slug: string; careersUrl: string; atsHint?: "greenhouse" | "lever" | "ashby" };
type AtsType = "greenhouse" | "lever" | "ashby";

async function probeGreenhouse(slug: string): Promise<number | null> {
  try {
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
    if (!res.ok) return null;
    const data = (await res.json()) as { jobs?: unknown[] };
    return Array.isArray(data.jobs) ? data.jobs.length : null;
  } catch {
    return null;
  }
}

async function probeLever(slug: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`);
    if (!res.ok) return null;
    const data = (await res.json()) as unknown[];
    return Array.isArray(data) ? data.length : null;
  } catch {
    return null;
  }
}

async function probeAshby(slug: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
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

async function main() {
  const candidates: Candidate[] = JSON.parse(
    readFileSync(join(process.cwd(), "config/companies.json"), "utf-8")
  );

  const results: { name: string; slug: string; atsType: AtsType | "unknown"; valid: boolean; jobCount: number | null }[] = [];

  for (const c of candidates) {
    // Only probe the hinted platform — trying a slug across all three risks a
    // false-positive collision with an unrelated company on another platform.
    const hint = c.atsHint ?? "greenhouse";
    const jobCount = await PROBES[hint](c.slug);
    const valid = jobCount !== null && jobCount > 0;
    const atsType: AtsType | "unknown" = valid ? hint : "unknown";
    results.push({ name: c.name, slug: c.slug, atsType, valid, jobCount });

    await prisma.company.upsert({
      where: { slug: c.slug },
      update: { name: c.name, careersUrl: c.careersUrl, atsType, active: valid },
      create: { name: c.name, slug: c.slug, careersUrl: c.careersUrl, atsType, active: valid },
    });
  }

  const byAts = (t: AtsType) => results.filter((r) => r.valid && r.atsType === t);
  const invalid = results.filter((r) => !r.valid);

  console.log(`\nValidated ${candidates.length} candidates:\n`);
  for (const ats of ["greenhouse", "lever", "ashby"] as AtsType[]) {
    console.log(`${ats} (active):`);
    for (const r of byAts(ats)) console.log(`  ✓ ${r.name} (${r.slug}) — ${r.jobCount} jobs`);
  }
  console.log("\nDid not resolve (marked inactive):");
  for (const r of invalid) console.log(`  ✗ ${r.name} (${r.slug}, hinted ${candidates.find((c) => c.slug === r.slug)?.atsHint})`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
