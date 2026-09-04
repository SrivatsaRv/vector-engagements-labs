import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { PUBLIC_API_ADMISSION_POLICY } from "./lib/security/admission-policy.ts";

const LOCAL_HYPERDRIVE_ID = "00000000000000000000000000000000";
const hyperdriveId =
  process.env.CLOUDFLARE_HYPERDRIVE_ID ?? LOCAL_HYPERDRIVE_ID;
const productionHost = process.env.VECTOR_PRODUCTION_HOST;
const includeLocalMetricsBinding =
  !productionHost && process.env.npm_lifecycle_event !== "deploy";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

// Static Worker structure lives in wrangler.jsonc. This overlay contains only
// environment-derived bindings which cannot be committed to that file.
const runtimeBindingConfig = {
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
  ratelimits: [
    {
      name: "PUBLIC_API_RATE_LIMITER",
      namespace_id: "22001",
      simple: {
        limit: PUBLIC_API_ADMISSION_POLICY.PUBLIC_API_RATE_LIMITER.limit,
        period: PUBLIC_API_ADMISSION_POLICY.PUBLIC_API_RATE_LIMITER.periodSeconds as 60,
      },
    },
    {
      name: "BROWSER_TELEMETRY_RATE_LIMITER",
      namespace_id: "22003",
      simple: {
        limit: PUBLIC_API_ADMISSION_POLICY.BROWSER_TELEMETRY_RATE_LIMITER.limit,
        period: PUBLIC_API_ADMISSION_POLICY.BROWSER_TELEMETRY_RATE_LIMITER.periodSeconds as 60,
      },
    },
    {
      name: "TILE_RATE_LIMITER",
      namespace_id: "22002",
      simple: {
        limit: PUBLIC_API_ADMISSION_POLICY.TILE_RATE_LIMITER.limit,
        period: PUBLIC_API_ADMISSION_POLICY.TILE_RATE_LIMITER.periodSeconds as 60,
      },
    },
  ],
  ...(includeLocalMetricsBinding
    ? {
        vars: {
          METRICS_BEARER_TOKEN:
            process.env.METRICS_BEARER_TOKEN ?? "vector-local-metrics",
        },
      }
    : {}),
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

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
        configPath: "./wrangler.jsonc",
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: runtimeBindingConfig,
      }),
    ],
  };
});
