/**
 * Probes each candidate company's Greenhouse public boards API and keeps only the
 * ones that actually resolve, since several companies on the target list (Meta,
 * Google, Apple, Microsoft, Netflix, Salesforce, ...) are not on Greenhouse.
 * Seeds/updates the Company table accordingly.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "../lib/db";

type Candidate = { name: string; slug: string; careersUrl: string };

async function isGreenhouseCompany(slug: string): Promise<number | null> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { jobs?: unknown[] };
    if (!Array.isArray(data.jobs)) return null;
    return data.jobs.length;
  } catch {
    return null;
  }
}

async function main() {
  const candidates: Candidate[] = JSON.parse(
    readFileSync(join(process.cwd(), "config/companies.json"), "utf-8")
  );

  const results: { name: string; slug: string; valid: boolean; jobCount: number | null }[] = [];

  for (const c of candidates) {
    const jobCount = await isGreenhouseCompany(c.slug);
    const valid = jobCount !== null && jobCount > 0;
    results.push({ name: c.name, slug: c.slug, valid, jobCount });

    await prisma.company.upsert({
      where: { slug: c.slug },
      update: {
        name: c.name,
        careersUrl: c.careersUrl,
        atsType: valid ? "greenhouse" : "unknown",
        active: valid,
      },
      create: {
        name: c.name,
        slug: c.slug,
        careersUrl: c.careersUrl,
        atsType: valid ? "greenhouse" : "unknown",
        active: valid,
      },
    });
  }

  const valid = results.filter((r) => r.valid);
  const invalid = results.filter((r) => !r.valid);

  console.log(`\nValidated ${candidates.length} candidates against Greenhouse boards API:\n`);
  console.log("Greenhouse-hosted (active):");
  for (const r of valid) console.log(`  ✓ ${r.name} (${r.slug}) — ${r.jobCount} jobs`);
  console.log("\nNot on Greenhouse (marked inactive, deferred):");
  for (const r of invalid) console.log(`  ✗ ${r.name} (${r.slug})`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
