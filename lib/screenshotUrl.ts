/** Converts a stored repo-relative screenshot path (e.g. "public/screenshots/vercel/abc.png")
 * into the web-servable URL Next.js exposes for anything under /public. */
export function screenshotUrl(screenshotPath: string | null): string | null {
  if (!screenshotPath) return null;
  return "/" + screenshotPath.replace(/^public\//, "");
}
