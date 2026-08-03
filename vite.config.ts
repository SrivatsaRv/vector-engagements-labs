import vinext from "vinext";
import { defineConfig } from "vite";

const LOCAL_HYPERDRIVE_ID = "00000000-0000-4000-8000-000000000000";
const hyperdriveId =
  process.env.CLOUDFLARE_HYPERDRIVE_ID ?? LOCAL_HYPERDRIVE_ID;
const productionHost = process.env.VECTOR_PRODUCTION_HOST;
const isVinextDeploy = process.env.npm_lifecycle_event === "deploy";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  name: "vector-engagement-labs",
  main: "./worker/index.ts",
  // Keep this at or below the newest date supported by the pinned local
  // Wrangler/workerd runtime. Update it deliberately with that dependency.
  compatibility_date: "2026-05-22",
  // Local Cloudflare builds need nodejs_compat. During `vinext deploy`, vinext
  // adds the same flag to its generated configuration, so omit our copy.
  ...(isVinextDeploy ? {} : { compatibility_flags: ["nodejs_compat"] }),
  observability: { enabled: true },
  routes: productionHost
    ? [{ pattern: productionHost, custom_domain: true }]
    : [],
  hyperdrive: [
    {
      binding: "HYPERDRIVE",
      id: hyperdriveId,
      localConnectionString:
        process.env.DATABASE_URL ??
        "postgres://vector:vector@127.0.0.1:55433/vector",
    },
  ],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    define: {
      // Worker route modules do not receive Docker environment variables at
      // request time. Bake the non-secret collector address into the server
      // bundle so local Compose traces reach the collector reliably.
      __VECTOR_OTEL_ENDPOINT__: JSON.stringify(
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "",
      ),
    },
    optimizeDeps: {
      // MapLibre creates its worker from the package entrypoint. Pre-bundling
      // rewrites that entry to a transient `.vite/deps` worker path which is
      // not present in the container runtime.
      exclude: ["maplibre-gl"],
    },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
