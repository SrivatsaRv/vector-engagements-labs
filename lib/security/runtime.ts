type SecurityRuntimeEnv = Cloudflare.Env & {
  METRICS_BEARER_TOKEN?: string;
  PUBLIC_API_RATE_LIMITER?: RateLimit;
  TILE_RATE_LIMITER?: RateLimit;
};

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

export async function enforceRateLimit(
  request: Request,
  binding: "PUBLIC_API_RATE_LIMITER" | "TILE_RATE_LIMITER",
) {
  const limiter = (await runtimeEnv())?.[binding];
  if (!limiter) return;
  const actor = request.headers.get("cf-connecting-ip") ?? "anonymous";
  const { success } = await limiter.limit({ key: `${binding}:${actor}` });
  if (!success) {
    const { PublicApiError } = await import("./public-api");
    throw new PublicApiError(429, "rate_limit_exceeded");
  }
}
