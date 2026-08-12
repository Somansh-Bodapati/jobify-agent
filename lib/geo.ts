export type CountryCode = "US" | "IN" | "OTHER" | "UNKNOWN";

const US_STATES = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut",
  "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa",
  "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan",
  "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada",
  "new hampshire", "new jersey", "new mexico", "new york", "north carolina",
  "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island",
  "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont",
  "virginia", "washington", "west virginia", "wisconsin", "wyoming",
];
const US_STATE_ABBREVS = [
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il", "in",
  "ia", "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv",
  "nh", "nj", "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc", "sd", "tn",
  "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy", "dc",
];
const US_SIGNAL_WORDS = ["united states", "usa", "u.s.a.", "u.s.", "\\bus\\b"];

const INDIA_CITIES = [
  "bangalore", "bengaluru", "mumbai", "delhi", "new delhi", "hyderabad", "pune",
  "chennai", "gurgaon", "gurugram", "noida", "kolkata", "ahmedabad", "kochi",
  "jaipur", "chandigarh",
];

function containsAny(text: string, words: string[]): boolean {
  return words.some((w) => new RegExp(`\\b${w}\\b`, "i").test(text));
}

/**
 * Classifies a job's country from its location text (primary signal) and,
 * for ambiguous/unqualified "Remote" postings, its description text
 * (secondary signal — looks for explicit "must be based in ..." language).
 * Defaults to UNKNOWN rather than guessing — callers should treat UNKNOWN as
 * not eligible for country-gated filtering rather than assuming US.
 */
export function detectCountry(location: string | null, description: string = ""): CountryCode {
  const loc = (location ?? "").toLowerCase().trim();

  if (loc) {
    const hasUsState = US_STATES.some((s) => loc.includes(s)) ||
      US_STATE_ABBREVS.some((a) => new RegExp(`\\b${a}\\b`, "i").test(loc));
    const hasUsWord = US_SIGNAL_WORDS.some((w) => new RegExp(w, "i").test(loc));
    if (hasUsState || hasUsWord) return "US";

    const hasIndiaCity = INDIA_CITIES.some((c) => loc.includes(c));
    const hasIndiaWord = /\bindia\b/i.test(loc);
    if (hasIndiaCity || hasIndiaWord) return "IN";

    // Generic "Remote" with no geography — fall through to description check.
    if (!/^remote$|^remote\s*[-–]?\s*$/i.test(loc)) {
      // A specific non-US, non-India location (e.g. "Berlin", "London", "Poland").
      return "OTHER";
    }
  }

  const desc = description.toLowerCase();
  if (desc) {
    if (
      /must be (currently )?(based|located|residing) in the united states/i.test(desc) ||
      /authorized to work in the united states/i.test(desc) ||
      containsAny(desc, ["united states", "u\\.s\\.a\\.", "u\\.s\\."])
    ) {
      return "US";
    }
    if (containsAny(desc, ["india"])) return "IN";
  }

  return "UNKNOWN";
}
