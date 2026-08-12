/**
 * Pulls open jobs from the Ashby public job-board API for each active Ashby
 * company and upserts them, deduped on externalId+companySlug.
 * CLI: npx tsx scripts/scrape-ashby.ts [CompanyName, CompanyName2, ...]
 */
import { prisma } from "../lib/db";
import { detectSponsorshipSignal } from "../lib/sponsorship";
import { detectCountry } from "../lib/geo";
import { fetchWithRetry } from "../lib/fetchRetry";

type AshbyJob = {
  id: string;
  title: string;
  jobUrl?: string;
  applyUrl?: string;
  location?: string;
  descriptionPlain?: string;
  compensationTierSummary?: string;
  publishedAt?: string; // ISO string
};

async function scrapeCompany(slug: string): Promise<AshbyJob[]> {
  const res = await fetchWithRetry(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
  if (!res.ok) throw new Error(`Ashby API error for ${slug}: ${res.status}`);
  const data = (await res.json()) as { jobs?: AshbyJob[] };
  return data.jobs ?? [];
}

async function main() {
  const requestedNames = process.argv.slice(2).join(" ").split(",").map((s) => s.trim()).filter(Boolean);

  const companies = await prisma.company.findMany({
    where: {
      active: true,
      atsType: "ashby",
      ...(requestedNames.length > 0 ? { name: { in: requestedNames } } : {}),
    },
  });

  if (companies.length === 0) {
    console.log("No matching active Ashby companies found.");
    return;
  }

  let totalUpserted = 0;
  for (const company of companies) {
    const postings = await scrapeCompany(company.slug);
    for (const job of postings) {
      const url = job.jobUrl ?? job.applyUrl;
      if (!url) continue;
      const description = job.descriptionPlain ?? "";
      const sponsorshipSignal = detectSponsorshipSignal(job.title, description);
      const postedAt = job.publishedAt ? new Date(job.publishedAt) : null;
      const countryCode = detectCountry(job.location ?? null, description);
      await prisma.job.upsert({
        where: { externalId_companySlug: { externalId: job.id, companySlug: company.slug } },
        update: {
          title: job.title,
          url,
          location: job.location ?? null,
          description,
          sponsorshipSignal,
          postedAt,
          countryCode,
        },
        create: {
          externalId: job.id,
          companySlug: company.slug,
          title: job.title,
          url,
          location: job.location ?? null,
          description,
          sponsorshipSignal,
          postedAt,
          countryCode,
          source: "company_scrape",
        },
      });
      totalUpserted++;
    }
    console.log(`  ${company.name}: ${postings.length} jobs`);
  }

  console.log(`\nUpserted ${totalUpserted} jobs across ${companies.length} companies.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
