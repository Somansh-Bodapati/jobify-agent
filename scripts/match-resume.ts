/** CLI: npx tsx scripts/match-resume.ts "Senior Backend Engineer" ["job description text"] */
import { matchResume } from "../lib/matchResume";

const [title, description] = process.argv.slice(2);
if (!title) {
  console.error('Usage: tsx scripts/match-resume.ts "<job title>" ["<job description>"]');
  process.exit(1);
}

const result = matchResume(title, description ?? "");
if (!result) {
  console.log("NO_MATCH");
  process.exit(0);
}
console.log(JSON.stringify(result, null, 2));
