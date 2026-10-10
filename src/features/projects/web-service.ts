const SERVICE_PROBE_TIMEOUT_MS = 2000;

// Browser preview has no manifest scan. The native command re-reads the
// profile and ignores any address the page supplies; this path only runs there.
export async function openRunningWebService(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Web service URL is not valid: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Web service URL is not valid: ${url}`);
  }
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    SERVICE_PROBE_TIMEOUT_MS,
  );
  try {
    await fetch(url, { mode: "no-cors", signal: controller.signal });
  } catch {
    throw new Error(`Web service is not running at ${url}.`);
  } finally {
    clearTimeout(timeout);
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
