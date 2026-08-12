import type { AtsType } from "./types";

const WORKDAY_PATTERNS = [/myworkdayjobs\.com/i, /\.wd\d+\.myworkdayjobs\.com/i];

/** Sniffs a job/company URL's hostname to classify which ATS it's hosted on. */
export function detectAtsType(url: string): AtsType {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return "unknown";
  }

  if (/greenhouse\.io$/i.test(hostname)) return "greenhouse";
  if (/jobs\.lever\.co$/i.test(hostname)) return "lever";
  if (/jobs\.ashbyhq\.com$/i.test(hostname) || /ashbyhq\.com$/i.test(hostname)) return "ashby";
  if (WORKDAY_PATTERNS.some((re) => re.test(hostname))) return "workday";

  return "unknown";
}

/** Known custom/enterprise ATS hostnames outside our three supported platforms —
 * these are also routed to manual_apply_needed even though they aren't Workday specifically. */
const KNOWN_UNSUPPORTED_HOSTS = [
  /icims\.com$/i,
  /taleo\.net$/i,
  /successfactors\.com$/i,
  /oraclecloud\.com$/i,
  /brassring\.com$/i,
  /jobvite\.com$/i, // Jobvite could be added later; treated conservatively as unsupported for now
];

export function requiresManualApply(url: string): boolean {
  const atsType = detectAtsType(url);
  if (atsType === "workday") return true;
  try {
    const hostname = new URL(url).hostname;
    return KNOWN_UNSUPPORTED_HOSTS.some((re) => re.test(hostname));
  } catch {
    return false;
  }
}
