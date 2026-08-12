import { readFileSync, existsSync } from "fs";
import { join } from "path";

export type SalaryTier = { low: number; high: number };

export type Profile = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  linkedin: string;
  github: string;
  city: string;
  state: string;
  country: string;
  workAuthorization: {
    authorizedToWorkInUS: boolean;
    requiresSponsorshipNow: boolean;
    requiresSponsorshipFuture: boolean;
    freeTextAnswer: string;
  };
  selfIdentification: {
    gender: string;
    raceEthnicity: string;
    veteranStatus: string;
    disabilityStatus: string;
  };
  availability: {
    noticePeriod: string;
    startDateAnswer: string;
    relocation: boolean;
    remote: boolean;
  };
  salary: {
    freeTextAnswer: string;
    tiers: Record<string, SalaryTier>;
  };
};

const LOCAL_PATH = join(process.cwd(), "config/profile.local.json");
const EXAMPLE_PATH = join(process.cwd(), "config/profile.example.json");

export function loadProfile(): Profile {
  const path = existsSync(LOCAL_PATH) ? LOCAL_PATH : EXAMPLE_PATH;
  if (path === EXAMPLE_PATH) {
    console.warn(
      "config/profile.local.json not found — falling back to profile.example.json placeholders. " +
        "Fill in config/profile.local.json with real answers before submitting any real applications."
    );
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

/** Resolves the salary tier for a US state, falling back to DEFAULT. Accepts full names or abbreviations. */
export function salaryTierForState(profile: Profile, state: string): SalaryTier {
  const abbrevMap: Record<string, string> = {
    california: "CA", texas: "TX", "new york": "NY", massachusetts: "MA",
    "new jersey": "NJ", connecticut: "CT", "washington dc": "DC", "district of columbia": "DC",
  };
  const normalized = state.trim().toLowerCase();
  const key = abbrevMap[normalized] ?? state.trim().toUpperCase();
  return profile.salary.tiers[key] ?? profile.salary.tiers.DEFAULT;
}
