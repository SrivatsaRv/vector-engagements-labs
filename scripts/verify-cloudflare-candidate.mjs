#!/usr/bin/env node

import { resolve } from "node:path";
import { verifyCloudflareCandidate } from "./lib/cloudflare-candidate.mjs";

const [candidateRoot, expectedSourceSha] = process.argv.slice(2);
if (!candidateRoot || !expectedSourceSha) throw new Error("usage: verify-cloudflare-candidate.mjs <candidate-root> <expected-source-sha>");
const manifest = verifyCloudflareCandidate({ candidateRoot: resolve(candidateRoot), expectedSourceSha });
process.stdout.write(`${JSON.stringify({ sourceSha: manifest.sourceSha, files: manifest.files.length })}\n`);
