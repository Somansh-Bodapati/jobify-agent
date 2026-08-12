/**
 * Pulls open jobs from the Lever public postings API for each active Lever
 * company and upserts them, deduped on externalId+companySlug.
 * CLI: npx tsx scripts/scrape-lever.ts [CompanyName, CompanyName2, ...]
 */
import { prisma } from "../lib/db";
import { detectSponsorshipSignal } from "../lib/sponsorship";
import { fetchWithRetry } from "../lib/fetchRetry";

type LeverPosting = {
  id: string;
  text: string;
  hostedUrl: string;
  categories?: { location?: string };
  descriptionPlain?: string;
  salaryRange?: { min?: number; max?: number };
  createdAt?: number; // epoch ms
};

async function scrapeCompany(slug: string): Promise<LeverPosting[]> {
  const res = await fetchWithRetry(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  if (!res.ok) throw new Error(`Lever API error for ${slug}: ${res.status}`);
  return (await res.json()) as LeverPosting[];
}

async function main() {
  const requestedNames = process.argv.slice(2).join(" ").split(",").map((s) => s.trim()).filter(Boolean);

  const companies = await prisma.company.findMany({
    where: {
      active: true,
      atsType: "lever",
      ...(requestedNames.length > 0 ? { name: { in: requestedNames } } : {}),
    },
  });

  if (companies.length === 0) {
    console.log("No matching active Lever companies found.");
    return;
  }

  let totalUpserted = 0;
  for (const company of companies) {
    const postings = await scrapeCompany(company.slug);
    for (const job of postings) {
      const description = job.descriptionPlain ?? "";
      const sponsorshipSignal = detectSponsorshipSignal(job.text, description);
      const postedAt = job.createdAt ? new Date(job.createdAt) : null;
      await prisma.job.upsert({
        where: { externalId_companySlug: { externalId: job.id, companySlug: company.slug } },
        update: {
          title: job.text,
          url: job.hostedUrl,
          location: job.categories?.location ?? null,
          description,
          salaryMin: job.salaryRange?.min ?? null,
          salaryMax: job.salaryRange?.max ?? null,
          sponsorshipSignal,
          postedAt,
        },
        create: {
          externalId: job.id,
          companySlug: company.slug,
          title: job.text,
          url: job.hostedUrl,
          location: job.categories?.location ?? null,
          description,
          salaryMin: job.salaryRange?.min ?? null,
          salaryMax: job.salaryRange?.max ?? null,
          sponsorshipSignal,
          postedAt,
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
