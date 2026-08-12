/**
 * Company/run-state management utility, consolidating what used to be ad-hoc
 * logic in the /auto-apply command prose.
 *
 * CLI:
 *   npx tsx scripts/manage-companies.ts --add "Name" "https://careers-url" [--ats greenhouse|lever|ashby]
 *   npx tsx scripts/manage-companies.ts --approve "Company Name"
 *   npx tsx scripts/manage-companies.ts --unapprove "Company Name"
 *   npx tsx scripts/manage-companies.ts --unblock "Company Name"
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { prisma } from "../lib/db";

const RUN_STATE_PATH = join(process.cwd(), "config/run-state.json");
const COMPANIES_PATH = join(process.cwd(), "config/companies.json");

type RunState = { approvedCompanies: string[] };

function loadRunState(): RunState {
  if (!existsSync(RUN_STATE_PATH)) return { approvedCompanies: [] };
  return JSON.parse(readFileSync(RUN_STATE_PATH, "utf-8"));
}

function saveRunState(state: RunState) {
  writeFileSync(RUN_STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function probe(slug: string, ats: "greenhouse" | "lever" | "ashby"): Promise<number | null> {
  const urls: Record<typeof ats, string> = {
    greenhouse: `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
    lever: `https://api.lever.co/v0/postings/${slug}?mode=json`,
    ashby: `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
  } as const;
  try {
    const res = await fetch(urls[ats]);
    if (!res.ok) return null;
    const data = await res.json();
    const jobs = Array.isArray(data) ? data : data.jobs;
    return Array.isArray(jobs) ? jobs.length : null;
  } catch {
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--add") {
    const name = args[1];
    const careersUrl = args[2];
    const atsIdx = args.indexOf("--ats");
    const atsCandidates: ("greenhouse" | "lever" | "ashby")[] =
      atsIdx >= 0 ? [args[atsIdx + 1] as "greenhouse" | "lever" | "ashby"] : ["greenhouse", "lever", "ashby"];
    if (!name || !careersUrl) {
      console.error('Usage: --add "Name" "https://careers-url" [--ats greenhouse|lever|ashby]');
      process.exit(1);
    }
    const slug = slugify(name);
    let resolved: { ats: string; jobCount: number } | null = null;
    for (const ats of atsCandidates) {
      const jobCount = await probe(slug, ats);
      if (jobCount !== null && jobCount > 0) {
        resolved = { ats, jobCount };
        break;
      }
    }
    if (!resolved) {
      console.log(`Could not resolve "${name}" (slug: ${slug}) on any probed ATS. Not added — verify the slug and try --ats explicitly.`);
      process.exit(1);
    }
    await prisma.company.upsert({
      where: { slug },
      update: { name, careersUrl, atsType: resolved.ats, active: true },
      create: { name, slug, careersUrl, atsType: resolved.ats, active: true },
    });
    const companies = JSON.parse(readFileSync(COMPANIES_PATH, "utf-8"));
    if (!companies.some((c: { slug: string }) => c.slug === slug)) {
      companies.push({ name, slug, careersUrl, atsHint: resolved.ats });
      writeFileSync(COMPANIES_PATH, JSON.stringify(companies, null, 2) + "\n");
    }
    console.log(`Added ${name} (${resolved.ats}, ${resolved.jobCount} jobs found).`);
    await prisma.$disconnect();
    return;
  }

  if (args[0] === "--approve" || args[0] === "--unapprove") {
    const name = args[1];
    if (!name) {
      console.error("Usage: --approve|--unapprove \"Company Name\"");
      process.exit(1);
    }
    const state = loadRunState();
    if (args[0] === "--approve") {
      if (!state.approvedCompanies.includes(name)) state.approvedCompanies.push(name);
      console.log(`Approved "${name}" for real submission. Future /auto-apply runs will click Submit for this company.`);
    } else {
      state.approvedCompanies = state.approvedCompanies.filter((n) => n !== name);
      console.log(`Unapproved "${name}" — back to dry-run only.`);
    }
    saveRunState(state);
    await prisma.$disconnect();
    return;
  }

  if (args[0] === "--unblock") {
    const name = args[1];
    if (!name) {
      console.error('Usage: --unblock "Company Name"');
      process.exit(1);
    }
    await prisma.company.updateMany({
      where: { name },
      data: { blocked: false, consecutiveFailures: 0, lastFailureReason: null },
    });
    console.log(`Unblocked "${name}" — circuit breaker reset.`);
    await prisma.$disconnect();
    return;
  }

  console.error("Usage: --add | --approve | --unapprove | --unblock");
  process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
