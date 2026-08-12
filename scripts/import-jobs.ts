/**
 * Imports broadly-discovered jobs (from Claude's JobDataLake search_jobs
 * calls) into the Job/Company tables, tagged source: "jobdatalake". The
 * company slug is derived from the apply URL's path when it's a recognized
 * ATS (more reliable than slugifying the display name — avoids collisions),
 * falling back to a slugified company name otherwise.
 *
 * CLI: npx tsx scripts/import-jobs.ts <path-to-json-file>
 * JSON shape: array of { id?, title, company, location?, salaryMin?, salaryMax?, skills?, url }
 */
import { readFileSync } from "fs";
import { prisma } from "../lib/db";
import { detectAtsType } from "../lib/ats/detect";
import { detectSponsorshipSignal } from "../lib/sponsorship";
import { dedupeIdFromUrl } from "../lib/dedupe";

type ImportedJob = {
  id?: string;
  title: string;
  company: string;
  location?: string;
  salaryMin?: number;
  salaryMax?: number;
  skills?: string[];
  url: string;
};

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function companySlugFromUrl(url: string): string | null {
  try {
    const { pathname } = new URL(url);
    const segments = pathname.split("/").filter(Boolean);
    return segments[0] || null;
  } catch {
    return null;
  }
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: tsx scripts/import-jobs.ts <path-to-json-file>");
    process.exit(1);
  }

  const jobs: ImportedJob[] = JSON.parse(readFileSync(filePath, "utf-8"));
  let created = 0;
  let skipped = 0;

  for (const job of jobs) {
    if (!job.url || !job.title || !job.company) {
      skipped++;
      continue;
    }

    const atsType = detectAtsType(job.url);
    const slug = (atsType !== "unknown" ? companySlugFromUrl(job.url) : null) ?? slugify(job.company);

    await prisma.company.upsert({
      where: { slug },
      update: {}, // don't overwrite an existing curated company's careersUrl/atsType
      create: { name: job.company, slug, careersUrl: job.url, atsType, active: true },
    });

    const description = job.skills?.length ? `Skills: ${job.skills.join(", ")}` : "";
    const sponsorshipSignal = detectSponsorshipSignal(job.title, description);
    const externalId = job.id ?? dedupeIdFromUrl(job.url);

    await prisma.job.upsert({
      where: { externalId_companySlug: { externalId, companySlug: slug } },
      update: {
        title: job.title,
        url: job.url,
        location: job.location ?? null,
        description,
        salaryMin: job.salaryMin ?? null,
        salaryMax: job.salaryMax ?? null,
        sponsorshipSignal,
      },
      create: {
        externalId,
        companySlug: slug,
        title: job.title,
        url: job.url,
        location: job.location ?? null,
        description,
        salaryMin: job.salaryMin ?? null,
        salaryMax: job.salaryMax ?? null,
        sponsorshipSignal,
        source: "jobdatalake",
      },
    });
    created++;
  }

  console.log(`Imported ${created} jobs (${skipped} skipped — missing fields).`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
