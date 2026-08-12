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

// --- Keyword weaving ---------------------------------------------------
// This is the line between honest tailoring and résumé fraud, and it's drawn
// deliberately: a skill can only be woven into a bullet if it is ALREADY a
// real, declared item in this resume's own skillGroups (i.e. the candidate
// already claims to have it) — never a technology invented because a JD
// mentions it. What changes is *which already-true skill gets surfaced in
// which bullet's sentence*, not the truth of what skills exist. This keeps
// every version "quick to pick up in interview": every named tool is one the
// candidate can actually speak to, just not always the one originally
// written into that specific sentence.
//
// Capped resume-wide (not per-subsection): the first version of this
// injected the same top-scoring missing skill into up to 2 bullets in every
// one of 5 subsections — "drawing on Java" ten times across one resume reads
// as obviously mechanical and undermines the whole point. Real recruiters
// and ATS semantic matching both penalize repetition, so this rotates
// through distinct missing skills and injects into only a handful of the
// single most relevant bullets resume-wide.
const MAX_TOTAL_INJECTIONS = 4;

function allDeclaredSkills(content: ResumeContent): string[] {
  const skills: string[] = [];
  for (const group of Object.values(content.skillGroups)) {
    for (const item of group.items) skills.push(item);
  }
  return skills;
}

/**
 * Which bullet-tags each declared skill is thematically compatible with —
 * without this, injection was picking bullets purely by JD-relevance score
 * and ignoring whether the specific skill made sense in that sentence at
 * all (verified live: "OracleDB" got woven into a bullet about fiber-optic
 * networking hardware, "Kubernetes" into a frontend-API-integration bullet
 * — exactly the kind of mismatch an interviewer would immediately flag,
 * which defeats "quick to pick up in interview"). Two trivial/universal
 * tools (Git, VSCode) are excluded entirely — everyone has them, weaving
 * them in signals nothing and isn't worth the risk of a bad placement.
 */
const SKILL_TAGS: Record<string, string[]> = {
  "Angular (16+)": ["frontend", "angular", "ui"],
  React: ["frontend", "react", "ui"],
  TypeScript: ["frontend", "react", "angular"],
  RxJS: ["frontend", "angular"],
  NgRx: ["frontend", "angular"],
  JavaScript: ["frontend"],
  HTML5: ["frontend", "ui"],
  CSS: ["frontend", "ui", "accessibility"],
  SASS: ["frontend", "ui"],
  Python: ["python", "ai", "genai"],
  Java: ["java", "enterprise"],
  Jest: ["testing", "frontend"],
  "RESTful APIs": ["api", "integration"],
  OAuth: ["api", "integration"],
  SpringBoot: ["java", "enterprise", "api"],
  Bootstrap: ["frontend", "ui"],
  OracleDB: ["java", "enterprise"],
  MongoDB: ["api", "integration"],
  "Micro Frontends": ["frontend", "architecture"],
  "Webpack Module Federation": ["frontend", "architecture", "performance"],
  "Design Systems": ["frontend", "ui", "architecture"],
  "Reusable Component Libraries": ["frontend", "ui", "architecture", "testing"],
  Figma: ["frontend", "ui"],
  "Python GenAI Services": ["python", "ai", "genai"],
  "LLM Agent Workflows": ["ai", "genai", "llm", "agent"],
  "Agile/Scrum": ["workflow", "cross_functional"],
  Jira: ["workflow", "cross_functional"],
  Docker: ["architecture", "performance"],
  Kubernetes: ["architecture", "performance"],
  "TDD/BDD": ["testing"],
  "CI/CD": ["workflow", "performance"],
  Jenkins: ["workflow", "performance"],
};

function isSkillCompatibleWithBullet(skill: string, bullet: Bullet): boolean {
  const compatibleTags = SKILL_TAGS[skill];
  if (!compatibleTags) return false; // unmapped (e.g. Git/GitHub, VSCode) — never a candidate
  return compatibleTags.some((t) => bullet.tags.includes(t));
}

/** Finds declared skills that the JD text mentions (by name, case-insensitive,
 * tolerant of common punctuation variants like "Node.js" vs "nodejs"). */
function skillsMentionedInJob(declaredSkills: string[], jobText: string): string[] {
  const haystack = jobText.toLowerCase();
  return declaredSkills.filter((skill) => {
    const normalized = skill
      .toLowerCase()
      .replace(/\s*\([^)]*\)/g, "") // "Angular (16+)" -> "angular"
      .trim();
    if (!normalized) return false;
    const bare = normalized.replace(/[.\-\s]/g, ""); // "Node.js" -> "nodejs", "Micro Frontends" -> "microfrontends"
    return haystack.includes(normalized) || haystack.includes(bare);
  });
}

function bulletMentionsSkill(bulletText: string, skill: string): boolean {
  const normalized = skill.toLowerCase().replace(/\s*\([^)]*\)/g, "").trim();
  return bulletText.toLowerCase().includes(normalized);
}

/** Weaves a real, already-declared skill into a bullet's existing sentence
 * as a trailing clause, grammatically hedged so it reads as emphasis/detail
 * rather than a bolted-on keyword dump. Never touches the bullet's factual
 * claims (what was built, for whom, what the measured outcome was) — only
 * adds which already-true tool was used. */
function weaveSkillIntoBullet(bulletText: string, skill: string): string {
  const clean = skill.replace(/\s*\([^)]*\)/g, "").trim();
  const endsWithPeriod = /\.\s*$/.test(bulletText);
  const base = endsWithPeriod ? bulletText.replace(/\.\s*$/, "") : bulletText;
  return `${base}, drawing on ${clean}.`;
}

type FlatBullet = { subsectionRef: Bullet[]; index: number; bullet: Bullet; relevance: number };

/**
 * Reorders bullets by relevance to the job's extracted tags (highest first),
 * then weaves already-declared-but-unmentioned JD skills into a small,
 * resume-wide-capped set of the single most relevant bullets — rotating
 * through distinct skills rather than repeating the same one everywhere.
 * Every bullet stays real; nothing is invented; every injected skill is one
 * already listed in the Skills section of this exact resume. Bullets are
 * only ever dropped (never rewritten away) as a last-resort page-overflow trim.
 */
export function tailorContentForJob(
  content: ResumeContent,
  jobTitle: string,
  jobDescription: string,
  opts: { maxBulletsToDropPerSubsection?: number } = {}
): ResumeContent {
  const jobTags = extractJobTags(jobTitle, jobDescription);
  const maxDrop = opts.maxBulletsToDropPerSubsection ?? 0;
  const jobText = `${jobTitle} ${jobDescription}`;
  const declaredSkills = allDeclaredSkills(content);
  const jdSkills = skillsMentionedInJob(declaredSkills, jobText);

  // First pass: reorder + trim within each subsection (unchanged behavior).
  const reorderedExperience = content.experience.map((job) => ({
    ...job,
    subsections: job.subsections.map((sub) => {
      const ranked = [...sub.bullets].sort((a, b) => bulletRelevance(b, jobTags) - bulletRelevance(a, jobTags));
      const kept = maxDrop > 0 && ranked.length > maxDrop ? ranked.slice(0, ranked.length - maxDrop) : ranked;
      return { ...sub, bullets: kept };
    }),
  }));

  if (jdSkills.length === 0) return { ...content, experience: reorderedExperience };

  // Second pass: pick the top MAX_TOTAL_INJECTIONS bullets RESUME-WIDE (not
  // per-subsection) that are missing at least one JD-relevant skill, and
  // weave in a different skill into each — round-robining through jdSkills
  // so the same word doesn't repeat across the whole document.
  const candidates: FlatBullet[] = [];
  for (const job of reorderedExperience) {
    for (const sub of job.subsections) {
      sub.bullets.forEach((bullet, index) => {
        const hasCompatibleMissingSkill = jdSkills.some(
          (s) => !bulletMentionsSkill(bullet.text, s) && isSkillCompatibleWithBullet(s, bullet)
        );
        if (hasCompatibleMissingSkill) {
          candidates.push({ subsectionRef: sub.bullets, index, bullet, relevance: bulletRelevance(bullet, jobTags) });
        }
      });
    }
  }
  candidates.sort((a, b) => b.relevance - a.relevance);

  const usedSkillCounts = new Map<string, number>();
  let injected = 0;
  for (const candidate of candidates) {
    if (injected >= MAX_TOTAL_INJECTIONS) break;
    // Compatibility gate is what fixed the "OracleDB in a fiber-optics
    // bullet" problem — a skill is only a candidate for THIS bullet if it
    // shares a real thematic tag with it, not just "the JD mentioned it and
    // this bullet scored high overall."
    const missing = jdSkills.filter(
      (s) => !bulletMentionsSkill(candidate.bullet.text, s) && isSkillCompatibleWithBullet(s, candidate.bullet)
    );
    if (missing.length === 0) continue;
    // Prefer whichever missing skill has been used least so far, for variety.
    missing.sort((a, b) => (usedSkillCounts.get(a) ?? 0) - (usedSkillCounts.get(b) ?? 0));
    const chosen = missing[0];
    candidate.subsectionRef[candidate.index] = {
      ...candidate.bullet,
      text: weaveSkillIntoBullet(candidate.bullet.text, chosen),
    };
    usedSkillCounts.set(chosen, (usedSkillCounts.get(chosen) ?? 0) + 1);
    injected++;
  }

  return { ...content, experience: reorderedExperience };
}
