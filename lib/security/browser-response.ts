/**
 * Baseline response headers shared by the Cloudflare Worker and Node runtime.
 *
 * This is deliberately a transport boundary, not a substitute for structural
 * content rendering. The current application requires inline bootstrap and
 * style payloads from its framework, so this policy does not claim to block
 * inline-script injection. #70 will replace those allowances with a proven
 * nonce/hash policy before accepting operator-authored content.
 */
export const BROWSER_SECURITY_HEADERS = {
  "content-security-policy":
    "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; form-action 'self'",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
} as const;

export function withBrowserSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(BROWSER_SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
