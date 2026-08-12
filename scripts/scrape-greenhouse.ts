/**
 * Pulls open jobs from the Greenhouse public boards API for each active
 * Greenhouse company and upserts them, deduped on externalId+companySlug.
 * CLI: npx tsx scripts/scrape-greenhouse.ts [CompanyName, CompanyName2, ...]
 */
import { prisma } from "../lib/db";

type GreenhouseJob = {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string };
  content?: string;
  updated_at?: string;
};

async function scrapeCompany(slug: string) {
  const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
  if (!res.ok) throw new Error(`Greenhouse API error for ${slug}: ${res.status}`);
  const data = (await res.json()) as { jobs: GreenhouseJob[] };
  return data.jobs;
}

async function main() {
  const requestedNames = process.argv.slice(2).join(" ").split(",").map((s) => s.trim()).filter(Boolean);

  const companies = await prisma.company.findMany({
    where: {
      active: true,
      atsType: "greenhouse",
      ...(requestedNames.length > 0 ? { name: { in: requestedNames } } : {}),
    },
  });

  if (companies.length === 0) {
    console.log("No matching active Greenhouse companies found.");
    return;
  }

  let totalUpserted = 0;
  for (const company of companies) {
    const jobs = await scrapeCompany(company.slug);
    for (const job of jobs) {
      await prisma.job.upsert({
        where: { externalId_companySlug: { externalId: String(job.id), companySlug: company.slug } },
        update: {
          title: job.title,
          url: job.absolute_url,
          location: job.location?.name ?? null,
          description: job.content ?? null,
        },
        create: {
          externalId: String(job.id),
          companySlug: company.slug,
          title: job.title,
          url: job.absolute_url,
          location: job.location?.name ?? null,
          description: job.content ?? null,
        },
      });
      totalUpserted++;
    }
    console.log(`  ${company.name}: ${jobs.length} jobs`);
  }

  console.log(`\nUpserted ${totalUpserted} jobs across ${companies.length} companies.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
