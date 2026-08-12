import { prisma } from "./db";

const NOTES_MARKER = "Unmatched required fields need manual review: ";

/**
 * Scans recent Application.notes for the "Unmatched required fields" list
 * (written by scripts/run-auto-apply.ts / lib/ats/engine.ts) and tallies how
 * often each distinct question text recurs. A question that shows up across
 * many postings is a real gap in config/answers.template.json worth fixing
 * once, rather than something to keep silently leaving blank forever.
 */
export async function reportRecurringUnmatchedQuestions(
  minOccurrences = 2,
  lookback = 200
): Promise<{ question: string; count: number }[]> {
  const applications = await prisma.application.findMany({
    where: { notes: { contains: NOTES_MARKER } },
    orderBy: { appliedAt: "desc" },
    take: lookback,
    select: { notes: true },
  });

  const tally = new Map<string, number>();
  for (const app of applications) {
    const notes = app.notes ?? "";
    const idx = notes.indexOf(NOTES_MARKER);
    if (idx === -1) continue;
    const list = notes.slice(idx + NOTES_MARKER.length);
    for (const question of list.split(";").map((q) => q.trim()).filter(Boolean)) {
      tally.set(question, (tally.get(question) ?? 0) + 1);
    }
  }

  return [...tally.entries()]
    .filter(([, count]) => count >= minOccurrences)
    .map(([question, count]) => ({ question, count }))
    .sort((a, b) => b.count - a.count);
}
