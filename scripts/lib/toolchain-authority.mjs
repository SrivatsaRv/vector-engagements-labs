import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const REQUIRED_POPPLER_VERSION = "26.05.0";
export const REQUIRED_WASM_TARGET = "wasm32-unknown-unknown";

function exactVersion(value, label) {
  if (typeof value !== "string" || !/^\d+\.\d+\.\d+$/u.test(value)) {
    throw new Error(`${label} must be one exact semantic version.`);
  }
  return value;
}

export function readToolchainAuthority(root = new URL("../../", import.meta.url)) {
  const manifest = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
  const nodeVersionFile = readFileSync(new URL(".node-version", root), "utf8").trim();
  const rustToolchain = readFileSync(new URL("rust-toolchain.toml", root), "utf8");
  const rustVersion = rustToolchain.match(/^channel\s*=\s*"([^"]+)"$/mu)?.[1];
  const npmVersion = manifest.packageManager?.match(/^npm@(\d+\.\d+\.\d+)$/u)?.[1];

  const authority = {
    node: exactVersion(manifest.engines?.node, "package.json engines.node"),
    npm: exactVersion(npmVersion, "package.json packageManager"),
    rust: exactVersion(rustVersion, "rust-toolchain.toml channel"),
    poppler: REQUIRED_POPPLER_VERSION,
    wasmTarget: REQUIRED_WASM_TARGET,
  };
  if (manifest.engines?.npm !== authority.npm) {
    throw new Error("package.json engines.npm must equal the packageManager npm version.");
  }
  if (nodeVersionFile !== authority.node) {
    throw new Error(".node-version must equal package.json engines.node.");
  }
  return authority;
}

function defaultRun(command, arguments_) {
  const result = spawnSync(command, arguments_, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const detail = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  if (result.error || result.status !== 0) {
    throw new Error(`${command} is unavailable${detail ? `: ${detail}` : "."}`);
  }
  return detail;
}

export function inspectToolchain({ run = defaultRun, nodeVersion = process.versions.node, allowMissingPoppler = false } = {}) {
  let poppler;
  try {
    poppler = run("pdftoppm", ["-v"]).match(/pdftoppm version\s+(\d+\.\d+\.\d+)/u)?.[1];
  } catch (error) {
    if (!allowMissingPoppler) throw error;
    poppler = null;
  }
  return {
    node: nodeVersion,
    npm: run("npm", ["--version"]),
    rust: run("rustc", ["--version"]).match(/^rustc\s+(\d+\.\d+\.\d+)/u)?.[1],
    poppler,
    rustTargets: run("rustup", ["target", "list", "--installed"]).split(/\r?\n/u).filter(Boolean),
  };
}

export function validateToolchain(authority, actual, { allowMissingPoppler = false } = {}) {
  const mismatches = [];
  for (const name of ["node", "npm", "rust", "poppler"]) {
    if (name === "poppler" && allowMissingPoppler && actual[name] === null) continue;
    if (actual[name] !== authority[name]) {
      mismatches.push(`${name}: required ${authority[name]}, found ${actual[name] ?? "unavailable"}`);
    }
  }
  if (!actual.rustTargets.includes(authority.wasmTarget)) {
    mismatches.push(`Rust target: required ${authority.wasmTarget}, found ${actual.rustTargets.join(", ") || "none"}`);
  }
  if (mismatches.length > 0) {
    throw new Error(`Toolchain preflight failed:\n- ${mismatches.join("\n- ")}`);
  }
  return { ...authority };
}
