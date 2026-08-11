import { resolve } from "node:path";
import { startProdServer } from "vinext/server/prod-server";

const port = Number(process.env.PORT ?? 4317);
const host = process.env.HOST ?? "0.0.0.0";

if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

await startProdServer({
  port,
  host,
  outDir: resolve("dist"),
});
