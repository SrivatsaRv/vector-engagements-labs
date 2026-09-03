#!/usr/bin/env node

import {
  inspectToolchain,
  readToolchainAuthority,
  validateToolchain,
} from "./lib/toolchain-authority.mjs";

try {
  const authority = readToolchainAuthority();
  const allowMissingPoppler = process.env.VECTOR_TOOLCHAIN_ALLOW_MISSING_POPPLER === "1";
  const actual = inspectToolchain({ allowMissingPoppler });
  validateToolchain(authority, actual, { allowMissingPoppler });
  const rendererNote = actual.poppler === null
    ? " Poppler is absent locally; hosted Linux gates provide the pinned renderer for PDF/source-render checks."
    : "";
  process.stdout.write(
    `Toolchain admitted: Node ${authority.node}, npm ${authority.npm}, Rust ${authority.rust}, ${authority.wasmTarget}, Poppler ${actual.poppler ?? "not installed"}.${rendererNote}\n`,
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
