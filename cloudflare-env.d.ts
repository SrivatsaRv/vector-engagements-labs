declare global {
  namespace Cloudflare {
    interface Env {
      HYPERDRIVE: Hyperdrive;
      DATABASE_URL?: string;
    }
  }
}

export {};
