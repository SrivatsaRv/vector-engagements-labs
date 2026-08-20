import assert from "node:assert/strict";
import test from "node:test";

import {
  BROWSER_SECURITY_HEADERS,
  withBrowserSecurityHeaders,
} from "../lib/security/browser-response";

test("response security policy replaces a weaker handler-supplied policy without changing its body", async () => {
  const upstream = new Response("safe application response", {
    status: 201,
    headers: {
      "content-security-policy": "default-src *",
      "x-frame-options": "SAMEORIGIN",
      "cache-control": "private, no-store",
    },
  });

  const response = withBrowserSecurityHeaders(upstream);

  assert.equal(await response.text(), "safe application response");
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  for (const [name, value] of Object.entries(BROWSER_SECURITY_HEADERS)) {
    assert.equal(response.headers.get(name), value);
  }
  assert.doesNotMatch(response.headers.get("content-security-policy") ?? "", /default-src \*/);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
});
