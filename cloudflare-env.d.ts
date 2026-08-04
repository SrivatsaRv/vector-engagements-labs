declare global {
  namespace Cloudflare {
    interface Env {
      HYPERDRIVE: Hyperdrive;
      DATABASE_URL?: string;
      METRICS_BEARER_TOKEN?: string;
      PUBLIC_API_RATE_LIMITER?: RateLimit;
      TILE_RATE_LIMITER?: RateLimit;
    }
  }
}

export {};
