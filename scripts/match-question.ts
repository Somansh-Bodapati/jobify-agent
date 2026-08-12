/** CLI: npx tsx scripts/match-question.ts "Question text" [state] [salaryFieldKind] [visibleRangeHigh] */
import { matchQuestion, type SalaryFieldKind } from "../lib/matchQuestion";

const [questionText, state, salaryFieldKind, visibleRangeHigh] = process.argv.slice(2);
if (!questionText) {
  console.error('Usage: tsx scripts/match-question.ts "<question text>" [state] [salaryFieldKind] [visibleRangeHigh]');
  process.exit(1);
}

const result = matchQuestion(questionText, {
  state,
  salaryFieldKind: salaryFieldKind as SalaryFieldKind | undefined,
  visibleRangeHigh: visibleRangeHigh ? Number(visibleRangeHigh) : undefined,
});

console.log(JSON.stringify(result, null, 2));
