import { withDatabase } from "@/db";
import { PublicApiError } from "./public-api";
import {
  PUBLIC_API_ADMISSION_POLICY,
  type RateLimitBinding,
} from "./admission-policy";

type SecurityRuntimeEnv = Cloudflare.Env & {
  METRICS_BEARER_TOKEN?: string;
  PUBLIC_API_RATE_LIMITER?: RateLimit;
  TILE_RATE_LIMITER?: RateLimit;
};

export { PUBLIC_API_ADMISSION_POLICY, PUBLIC_API_ADMISSION_POLICY_VERSION } from "./admission-policy";
export type { RateLimitBinding } from "./admission-policy";

async function runtimeEnv(): Promise<SecurityRuntimeEnv | null> {
  try {
    const workersModule = `cloudflare:${"workers"}`;
    const { env } = await import(/* @vite-ignore */ workersModule);
    return env as SecurityRuntimeEnv;
  } catch {
    return null;
  }
}

export async function runtimeSecret(name: "METRICS_BEARER_TOKEN") {
  const local = process.env[name];
  if (local) return local;
  return (await runtimeEnv())?.[name] ?? "";
}

export async function requestActorHash(request: Request) {
  // A direct Node Request does not expose a verified peer address. It must not
  // trust forwarded headers, so its anonymous callers share one conservative
  // budget until a trusted-proxy adapter is explicitly introduced.
  const actor = process.env.VECTOR_RUNTIME === "node"
    ? "anonymous"
    : request.headers.get("cf-connecting-ip")?.trim() || "anonymous";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(actor));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function publicApiAdmissionStatus() {
  if (process.env.VECTOR_RUNTIME === "node") {
    return { runtime: "node", limiter: "postgres-fixed-window" } as const;
  }
  const env = await runtimeEnv();
  return {
    runtime: "cloudflare",
    limiter: env?.PUBLIC_API_RATE_LIMITER && env.TILE_RATE_LIMITER
      ? "cloudflare-rate-limiting"
      : "unavailable",
  } as const;
}

async function enforceNodeRateLimit(request: Request, binding: RateLimitBinding) {
  const policy = PUBLIC_API_ADMISSION_POLICY[binding];
  const now = Date.now();
  const windowStartMs = Math.floor(now / (policy.periodSeconds * 1000)) * policy.periodSeconds * 1000;
  const actorHash = await requestActorHash(request);
  try {
    const rows = await withDatabase((sql) => sql`
      INSERT INTO public_api_rate_windows
        (policy_id, actor_hash, window_started_at, request_count)
      VALUES
        (${binding}, ${actorHash}, to_timestamp(${windowStartMs} / 1000.0), 1)
      ON CONFLICT (policy_id, actor_hash, window_started_at)
      DO UPDATE SET request_count = public_api_rate_windows.request_count + 1
      WHERE public_api_rate_windows.request_count < ${policy.limit}
      RETURNING request_count
    `);
    if (!rows[0]) {
      const retryAfter = Math.max(1, Math.ceil((windowStartMs + policy.periodSeconds * 1000 - now) / 1000));
      throw new PublicApiError(429, "rate_limit_exceeded", "rate limit exceeded", {
        "retry-after": String(retryAfter),
      });
    }
  } catch (error) {
    if (error instanceof PublicApiError) throw error;
    throw new PublicApiError(503, "rate_limit_unavailable");
  }
}

export async function enforceRateLimit(
  request: Request,
  binding: RateLimitBinding,
) {
  if (process.env.VECTOR_RUNTIME === "node") {
    await enforceNodeRateLimit(request, binding);
    return;
  }
  const limiter = (await runtimeEnv())?.[binding];
  if (!limiter) {
    // Unit tests intentionally do not configure a deployed runtime. Deployed
    // Cloudflare and Node paths both fail closed when their adapter is absent.
    if (process.env.VECTOR_RUNTIME === "cloudflare") {
      throw new PublicApiError(503, "rate_limit_unavailable");
    }
    return;
  }
  try {
    const actor = request.headers.get("cf-connecting-ip") ?? "anonymous";
    const { success } = await limiter.limit({ key: `${binding}:${actor}` });
    if (!success) throw new PublicApiError(429, "rate_limit_exceeded", "rate limit exceeded", { "retry-after": "60" });
  } catch (error) {
    if (error instanceof PublicApiError) throw error;
    throw new PublicApiError(503, "rate_limit_unavailable");
  }
}
