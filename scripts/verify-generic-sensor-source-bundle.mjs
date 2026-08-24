#!/usr/bin/env node

import { verifyGenericSensorSourceBundle } from "./lib/generic-sensor-source-verifier.mjs";

const report = verifyGenericSensorSourceBundle();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
