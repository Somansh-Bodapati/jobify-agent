/**
 * Records (upserts, keyed on the unique dedupeId) an Application row for a
 * processed job. Called once per job by /auto-apply after the form is filled
 * (and submitted, if the company was pre-approved).
 *
 * CLI: npx tsx scripts/record-application.ts '<json>'
 * json shape: {
 *   jobId: string, resumeCategory: string, dedupeId: string,
 *   status: "ready_for_review" | "submitted" | "skipped_no_match" | "failed",
 *   screenshotPath?: string, notes?: string
 * }
 */
import { prisma } from "../lib/db";

type Input = {
  jobId: string;
  resumeCategory?: string;
  dedupeId: string;
  status: "ready_for_review" | "submitted" | "skipped_no_match" | "failed";
  screenshotPath?: string;
  notes?: string;
};

async function main() {
  const raw = process.argv[2];
  if (!raw) {
    console.error("Usage: tsx scripts/record-application.ts '<json>'");
    process.exit(1);
  }
  const input: Input = JSON.parse(raw);

  const resumeVariant = input.resumeCategory
    ? await prisma.resumeVariant.findUnique({ where: { category: input.resumeCategory } })
    : null;

  const application = await prisma.application.upsert({
    where: { dedupeId: input.dedupeId },
    update: {
      status: input.status,
      screenshotPath: input.screenshotPath ?? null,
      notes: input.notes ?? null,
    },
    create: {
      jobId: input.jobId,
      resumeVariantId: resumeVariant?.id ?? null,
      dedupeId: input.dedupeId,
      status: input.status,
      screenshotPath: input.screenshotPath ?? null,
      notes: input.notes ?? null,
    },
  });

  console.log(JSON.stringify(application, null, 2));
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
