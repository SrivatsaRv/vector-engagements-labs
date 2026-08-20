import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:net";
import { register } from "node:module";
import { spawn } from "node:child_process";
import test from "node:test";

register(new URL("./cloudflare-loader.mjs", import.meta.url));

const REQUIRED_HEADERS = {
  "content-security-policy": "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; form-action 'self'",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
};

function assertBrowserSecurityHeaders(response) {
  for (const [name, value] of Object.entries(REQUIRED_HEADERS)) {
    assert.equal(response.headers.get(name), value, `${name} must be present on the built response`);
  }
}

async function unusedLocalPort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Cannot allocate local test port.");
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitForNodeResponse(url, processHandle) {
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (processHandle.exitCode !== null) throw new Error(`Node production server exited with ${processHandle.exitCode}.`);
    try {
      return await fetch(url);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw lastError ?? new Error("Node production server did not accept requests.");
}

test("built Worker and Node responses enforce the same browser security headers", async (t) => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const workerResponse = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(workerResponse.status, 200);
  assertBrowserSecurityHeaders(workerResponse);

  const port = await unusedLocalPort();
  const nodeProcess = spawn(process.execPath, ["dist/runtime/start-production.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) },
    stdio: "ignore",
  });
  t.after(async () => {
    if (nodeProcess.exitCode === null) {
      nodeProcess.kill("SIGTERM");
      await once(nodeProcess, "exit");
    }
  });
  const nodeResponse = await waitForNodeResponse(`http://127.0.0.1:${port}/`, nodeProcess);
  assert.equal(nodeResponse.status, 200);
  assertBrowserSecurityHeaders(nodeResponse);
});
