#!/usr/bin/env node

import { resolve } from "node:path";
import { createCloudflareCandidate } from "./lib/cloudflare-candidate.mjs";

const sourceShaIndex = process.argv.indexOf("--source-sha");
if (sourceShaIndex < 0 || !process.argv[sourceShaIndex + 1]) throw new Error("--source-sha is required");
const outputIndex = process.argv.indexOf("--output");
const outputRoot = resolve(outputIndex >= 0 ? process.argv[outputIndex + 1] : "outputs/cloudflare-candidate");
const manifest = createCloudflareCandidate({ projectRoot: resolve("."), outputRoot, sourceSha: process.argv[sourceShaIndex + 1] });
process.stdout.write(`${JSON.stringify({ sourceSha: manifest.sourceSha, files: manifest.files.length, outputRoot })}\n`);
