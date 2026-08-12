const NEGATIVE_PATTERNS = [
  /\bno\s+(visa\s+)?sponsorship\b/i,
  /not\s+(able|eligible)\s+to\s+sponsor/i,
  /without\s+sponsorship/i,
  /must be (currently )?authorized to work.*without.*sponsorship/i,
  /we (are unable|cannot) (to )?(provide|offer) (visa )?sponsorship/i,
];

const POSITIVE_PATTERNS = [
  /visa sponsorship (is )?(available|offered|provided)/i,
  /will sponsor/i,
  /sponsorship (is )?available/i,
  /we (do |can )?sponsor visas/i,
];

/** Scans a job's title+description for explicit sponsorship language. Used to
 * deprioritize (not exclude) jobs that explicitly rule out sponsorship. */
export function detectSponsorshipSignal(
  title: string,
  description: string
): "mentions_sponsorship" | "no_sponsorship" | "unknown" {
  const text = `${title} ${description}`;
  if (NEGATIVE_PATTERNS.some((re) => re.test(text))) return "no_sponsorship";
  if (POSITIVE_PATTERNS.some((re) => re.test(text))) return "mentions_sponsorship";
  return "unknown";
}
