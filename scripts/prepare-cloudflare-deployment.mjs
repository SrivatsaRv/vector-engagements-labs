#!/usr/bin/env node

import { resolve } from "node:path";
import { prepareCloudflareDeployment } from "./lib/cloudflare-candidate.mjs";

const [candidateRoot, expectedSourceSha, outputPath] = process.argv.slice(2);
if (!candidateRoot || !expectedSourceSha || !outputPath) throw new Error("usage: prepare-cloudflare-deployment.mjs <candidate-root> <expected-source-sha> <output-config>");
const config = prepareCloudflareDeployment({
  candidateRoot: resolve(candidateRoot),
  outputPath: resolve(outputPath),
  expectedSourceSha,
  hyperdriveId: process.env.CLOUDFLARE_HYPERDRIVE_ID,
  productionHost: process.env.VECTOR_PRODUCTION_HOST,
});
process.stdout.write(`${JSON.stringify({ main: config.main, assets: config.assets.directory, routes: config.routes.length })}\n`);
