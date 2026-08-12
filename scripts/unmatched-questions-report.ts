/** CLI: npx tsx scripts/unmatched-questions-report.ts */
import { prisma } from "../lib/db";
import { reportRecurringUnmatchedQuestions } from "../lib/unmatchedQuestions";

async function main() {
  const recurring = await reportRecurringUnmatchedQuestions();
  if (recurring.length === 0) {
    console.log("No recurring unmatched required questions found.");
  } else {
    console.log("Recurring unmatched required questions (add these to config/answers.template.json):\n");
    for (const { question, count } of recurring) console.log(`  [${count}x] ${question}`);
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
