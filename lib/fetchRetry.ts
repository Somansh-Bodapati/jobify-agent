/** fetch with bounded retry + backoff for 429/5xx responses — a single
 * rate-limit blip from a scraper's source API shouldn't drop that company's
 * jobs for the whole run. */
export async function fetchWithRetry(url: string, maxAttempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`HTTP ${res.status}`);
      } else {
        return res; // non-retryable client error (404 etc) — let the caller handle it
      }
    } catch (err) {
      lastError = err;
    }
    if (attempt < maxAttempts) {
      const backoffMs = 500 * 2 ** (attempt - 1) + Math.random() * 250;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
