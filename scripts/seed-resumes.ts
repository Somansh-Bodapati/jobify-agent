import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "../lib/db";
import type { ResumeConfig } from "../lib/matchResume";

async function main() {
  const resumes: ResumeConfig[] = JSON.parse(
    readFileSync(join(process.cwd(), "config/resumes.json"), "utf-8")
  );

  for (const r of resumes) {
    await prisma.resumeVariant.upsert({
      where: { category: r.category },
      update: { label: r.label, pdfPath: r.pdfPath, keywords: JSON.stringify(r.keywords) },
      create: {
        category: r.category,
        label: r.label,
        pdfPath: r.pdfPath,
        keywords: JSON.stringify(r.keywords),
      },
    });
    console.log(`  ✓ ${r.category}`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
