import { readFileSync } from "fs";
import { join } from "path";
import { loadProfile, salaryTierForState, type Profile } from "./profile";

type AnswersConfig = {
  countryAliases: Record<string, string[]>;
  questionPatterns: { pattern: string; field: string; aliasGroup?: string }[];
  roleAnswers: Record<string, Record<string, string>>;
  generalAnswers: Record<string, string>;
};

export function loadAnswersConfig(): AnswersConfig {
  return JSON.parse(readFileSync(join(process.cwd(), "config/answers.template.json"), "utf-8"));
}

export type SalaryFieldKind = "free_text" | "numeric_with_range" | "numeric_no_range" | "range_selector";

export type MatchResult =
  | { kind: "field"; value: string | boolean; comboboxHint: string }
  | { kind: "salary"; value: string; tier: { low: number; high: number } }
  | { kind: "unmatched" };

/** Short text used to fuzzy-match against rendered dropdown/combobox option labels
 * (e.g. Greenhouse react-select). Booleans become "Yes"/"No"; long free-text
 * answers (like the sponsorship explanation) get a short-answer override. */
function comboboxHintFor(field: string, value: string | boolean, profile: Profile): string {
  if (field === "profile.workAuthorization.freeTextAnswer") {
    return profile.workAuthorization.requiresSponsorshipFuture ? "Yes" : "No";
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value;
}

function resolveField(profile: Profile, path: string): string | boolean {
  if (path.includes(" + ")) {
    return path
      .split(" + ")
      .map((p) => String(resolveField(profile, p.trim())))
      .join(" ");
  }
  const parts = path.replace(/^profile\./, "").split(".");
  let value: unknown = profile;
  for (const part of parts) {
    value = (value as Record<string, unknown>)?.[part];
  }
  return value as string | boolean;
}

/**
 * Resolves an ATS question's label text to an answer. Salary questions need the
 * job's US state and which kind of field it is (free text / numeric with a
 * visible range / numeric with no range / a range-selector dropdown) since the
 * rule differs per kind.
 */
export function matchQuestion(
  questionText: string,
  opts: { state?: string; salaryFieldKind?: SalaryFieldKind; visibleRangeHigh?: number } = {},
  profile: Profile = loadProfile(),
  config: AnswersConfig = loadAnswersConfig()
): MatchResult {
  const text = questionText.toLowerCase();

  for (const { pattern, field } of config.questionPatterns) {
    const re = new RegExp(pattern, "i");
    if (!re.test(text)) continue;

    if (field === "salaryRules") {
      const state = opts.state ?? profile.state;
      const tier = salaryTierForState(profile, state);
      switch (opts.salaryFieldKind ?? "free_text") {
        case "free_text":
          return { kind: "salary", value: profile.salary.freeTextAnswer, tier };
        case "numeric_with_range":
          return {
            kind: "salary",
            value: String(opts.visibleRangeHigh ?? tier.high),
            tier,
          };
        case "numeric_no_range":
          return { kind: "salary", value: String(tier.high), tier };
        case "range_selector":
          return { kind: "salary", value: `$${tier.low / 1000}K-$${tier.high / 1000}K`, tier };
      }
    }

    const value = resolveField(profile, field);
    return { kind: "field", value, comboboxHint: comboboxHintFor(field, value, profile) };
  }

  return { kind: "unmatched" };
}

/** Resolves country name variants (USA vs United States) to whatever the form's option text is. */
export function resolveCountryAlias(
  formOptionText: string,
  profileCountry: string,
  config: AnswersConfig = loadAnswersConfig()
): boolean {
  const opt = formOptionText.trim().toLowerCase();
  const country = profileCountry.trim().toLowerCase();
  if (opt === country) return true;
  const aliases = config.countryAliases[country] ?? [];
  return aliases.includes(opt);
}
