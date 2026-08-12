import type { ResumeContent, Bullet } from "./resumeTemplate";

/** Vocabulary of tags a JD can be scored against — kept in sync with the tags
 * used in config/resumeContent.json's bullets. Order doesn't matter. */
const TAG_KEYWORDS: Record<string, string[]> = {
  frontend: ["frontend", "front-end", "front end", "ui engineer", "client-side", "react", "angular"],
  react: ["react"],
  angular: ["angular"],
  ui: ["ui", "ux", "user interface", "accessibility", "responsive", "design system"],
  accessibility: ["accessibility", "a11y", "wcag"],
  backend: ["backend", "back-end", "back end", "server-side", "api", "microservices"],
  ai: ["ai", "artificial intelligence", "genai", "generative ai"],
  genai: ["genai", "generative ai", "llm"],
  llm: ["llm", "large language model", "agent"],
  agent: ["agent workflow", "agentic", "ai agent"],
  architecture: ["architecture", "micro frontend", "module federation", "design system"],
  microservices: ["microservices", "microservice", "distributed system"],
  performance: ["performance", "latency", "optimization", "scalability"],
  workflow: ["workflow", "orchestration", "approval"],
  enterprise: ["enterprise", "regulated", "compliance"],
  testing: ["testing", "test coverage", "jest", "unit test", "qa"],
  api: ["api", "restful", "rest api", "graphql"],
  integration: ["integration", "integrations"],
  networking: ["networking", "network", "protocol", "packet"],
  systems: ["systems", "low-level", "kernel", "embedded"],
  cross_functional: ["cross-functional", "cross functional", "collaborat"],
  python: ["python"],
  java: ["java"],
  general: [],
};

/** Extracts which known tags a job's title+description text signals, via
 * simple substring matching against TAG_KEYWORDS — deterministic, no LLM,
 * no risk of inventing anything since this only ever selects/reorders
 * bullets that already exist verbatim in the base resume. */
export function extractJobTags(jobTitle: string, jobDescription: string = ""): Set<string> {
  const haystack = `${jobTitle} ${jobDescription}`.toLowerCase();
  const tags = new Set<string>();
  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
    if (keywords.some((kw) => haystack.includes(kw))) tags.add(tag);
  }
  return tags;
}

function bulletRelevance(bullet: Bullet, jobTags: Set<string>): number {
  const overlap = bullet.tags.filter((t) => jobTags.has(t)).length;
  // Ties broken by the bullet's own authored priority (lower number = more
  // important/senior achievement) — never by arbitrary original order.
  return overlap * 100 - bullet.priority;
}

/**
 * Reorders (never rewrites or invents) bullets within each subsection by
 * relevance to the job's extracted tags — the highest-relevance, real bullet
 * text moves first. Every bullet already in the base resume is still
 * included; nothing is dropped unless dropLowestIfOverflow trims the very
 * lowest-relevance bullets to fit a page budget (used only as a last resort
 * by the render-and-verify retry loop, never invents replacement text).
 */
export function tailorContentForJob(
  content: ResumeContent,
  jobTitle: string,
  jobDescription: string,
  opts: { maxBulletsToDropPerSubsection?: number } = {}
): ResumeContent {
  const jobTags = extractJobTags(jobTitle, jobDescription);
  const maxDrop = opts.maxBulletsToDropPerSubsection ?? 0;

  const tailoredExperience = content.experience.map((job) => ({
    ...job,
    subsections: job.subsections.map((sub) => {
      const ranked = [...sub.bullets].sort((a, b) => bulletRelevance(b, jobTags) - bulletRelevance(a, jobTags));
      const kept = maxDrop > 0 && ranked.length > maxDrop ? ranked.slice(0, ranked.length - maxDrop) : ranked;
      return { ...sub, bullets: kept };
    }),
  }));

  return { ...content, experience: tailoredExperience };
}
