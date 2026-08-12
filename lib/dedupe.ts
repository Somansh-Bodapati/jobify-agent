import { createHash } from "crypto";

/** Deterministic id from a job application URL, used as the DB unique dedupe key. */
export function dedupeIdFromUrl(url: string): string {
  return createHash("sha256").update(url.trim().toLowerCase()).digest("hex").slice(0, 32);
}
