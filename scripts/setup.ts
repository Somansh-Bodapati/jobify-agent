/** One-command bootstrap: migrate -> validate all ATS companies -> seed resumes -> build resume variants. */
import { execSync } from "child_process";

const steps: [string, string][] = [
  ["Applying Prisma migrations", "npx prisma migrate deploy"],
  ["Validating companies across Greenhouse/Lever/Ashby", "npx tsx scripts/validate-companies.ts"],
  ["Seeding resume variants", "npx tsx scripts/seed-resumes.ts"],
  ["Building resume PDFs (1-page + link verified)", "npx tsx scripts/build-resume-variants.ts"],
];

for (const [label, cmd] of steps) {
  console.log(`\n=== ${label} ===`);
  execSync(cmd, { stdio: "inherit" });
}

console.log("\nSetup complete. Next: cp config/profile.example.json config/profile.local.json and fill in real values, then run `npm run apply`.");
