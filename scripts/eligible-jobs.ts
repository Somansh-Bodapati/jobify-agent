/**
 * CLI wrapper over lib/eligibleJobs.ts. Returns jobs eligible for /auto-apply,
 * split into `fillable` (Greenhouse/Lever/Ashby, not circuit-broken, sorted by
 * priority score) and `manualApplyNeeded` (matched a resume but on an
 * unsupported ATS). Dedup layer 1 (DB status check) applies to both.
 *
 * CLI: npx tsx scripts/eligible-jobs.ts [CompanyName, CompanyName2, ...] [--limit N]
 */
import { prisma } from "../lib/db";
import { getEligibleJobs } from "../lib/eligibleJobs";

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : undefined;
  const namesArgs = (limitIdx >= 0 ? args.slice(0, limitIdx) : args).join(" ");
  const requestedNames = namesArgs.split(",").map((s) => s.trim()).filter(Boolean);

  const { fillable, manualApplyNeeded, stats } = await getEligibleJobs(requestedNames, limit);

  console.error(
    `[eligible-jobs] ${stats.scanned} scanned | ${stats.skippedApplied} already applied/recorded | ${stats.skippedNoMatch} no resume match | ${stats.excludedByFilter} excluded (country/quality/salary gate) | ${fillable.length} fillable (${stats.usCount} US, ${stats.indiaCount} India fallback) | ${manualApplyNeeded.length} manual-apply-needed`
  );
  console.log(JSON.stringify({ fillable, manualApplyNeeded }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
