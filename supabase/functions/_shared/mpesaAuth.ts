// Shared-secret validation for public M-Pesa callback endpoints.
// Safaricom is configured with URLs that carry ?t=<MPESA_CALLBACK_SECRET>
// (or send it as the x-mpesa-token header / Basic Auth password).
export function isTrustedMpesaCaller(req: Request): boolean {
  const expected = Deno.env.get("MPESA_CALLBACK_SECRET");
  if (!expected) return false; // fail closed when not configured

  const url = new URL(req.url);
  const candidates: (string | null)[] = [
    url.searchParams.get("t"),
    url.searchParams.get("token"),
    req.headers.get("x-mpesa-token"),
  ];

  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = atob(auth.slice(6).trim());
      candidates.push(decoded.slice(decoded.indexOf(":") + 1));
    } catch { /* ignore malformed header */ }
  }

  return candidates.some((c) => typeof c === "string" && c.length > 0 && c === expected);
}
