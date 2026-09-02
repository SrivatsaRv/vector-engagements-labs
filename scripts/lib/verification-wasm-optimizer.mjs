import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import process from "node:process";

export const VERIFICATION_WASM_OPTIMIZER =
  "binaryen@131.0.0 -O3 -S2 --reorder-functions rust-wasm-features-v1";
export const VERIFICATION_WASM_LINUX_AMD64_BUILDER =
  "rust@sha256:0e2bcaef56d041a486784e54104a81aebe0da44bd03019bd70bc0401e42e4a97";
export const VERIFICATION_WASM_BUILD_POLICY =
  `linux-amd64-rust-1.97.1 ${VERIFICATION_WASM_LINUX_AMD64_BUILDER} rust-path-remap-v1 workspace=/vector/source cargo=/vector/cargo rustup=/vector/rustup ambient-flags=discarded`;

export function verificationWasmCargoEnvironment(root, sourceEnvironment = process.env) {
  const environment = { ...sourceEnvironment };
  const cargoHome = resolve(environment.CARGO_HOME ?? resolve(homedir(), ".cargo"));
  const rustupHome = resolve(environment.RUSTUP_HOME ?? resolve(homedir(), ".rustup"));
  const flags = [
    `--remap-path-prefix=${resolve(root)}=/vector/source`,
    `--remap-path-prefix=${cargoHome}=/vector/cargo`,
    `--remap-path-prefix=${rustupHome}=/vector/rustup`,
  ];

  delete environment.RUSTFLAGS;
  environment.CARGO_ENCODED_RUSTFLAGS = flags.join("\x1f");
  return environment;
}

export function verificationWasmBuildRuntime(platform = process.platform, arch = process.arch) {
  return platform === "linux" && arch === "x64" ? "native-linux-amd64" : "docker-linux-amd64";
}

function repositoryRelative(root, path, label) {
  const value = relative(root, path);
  if (value === "" || value === ".." || value.startsWith("../") || value.startsWith("..\\")) {
    throw new Error(`${label} must be inside the repository root.`);
  }
  return value.replaceAll("\\", "/");
}

export function buildVerificationWasm({ root, manifest, wasmPath, cargo = process.env.CARGO ?? "cargo" }) {
  if (verificationWasmBuildRuntime() === "native-linux-amd64") {
    execFileSync(cargo, ["build", "--locked", "--release", "--target", "wasm32-unknown-unknown", "--manifest-path", manifest], {
      cwd: root,
      env: verificationWasmCargoEnvironment(root),
      stdio: "inherit",
    });
    return readFileSync(wasmPath);
  }

  const manifestRelative = repositoryRelative(root, manifest, "Verification Cargo manifest");
  const artifact = basename(wasmPath);
  if (!/^[a-z0-9_]+\.wasm$/u.test(artifact)) {
    throw new Error("Verification WASM artifact name is not safe for the governed builder.");
  }
  const output = mkdtempSync(join(tmpdir(), "vector-verification-wasm-"));
  const containerFlags = [
    "--remap-path-prefix=/work=/vector/source",
    "--remap-path-prefix=/usr/local/cargo=/vector/cargo",
    "--remap-path-prefix=/usr/local/rustup=/vector/rustup",
  ].join("\x1f");

  try {
    execFileSync("docker", [
      "run",
      "--rm",
      "--platform",
      "linux/amd64",
      "-e",
      `CARGO_ENCODED_RUSTFLAGS=${containerFlags}`,
      "-v",
      `${root}:/work:ro`,
      "-v",
      `${output}:/out`,
      VERIFICATION_WASM_LINUX_AMD64_BUILDER,
      "sh",
      "-c",
      "rustup target add wasm32-unknown-unknown && CARGO_TARGET_DIR=/tmp/vector-target cargo build --locked --release --target wasm32-unknown-unknown --manifest-path \"$1\" && cp \"/tmp/vector-target/wasm32-unknown-unknown/release/$2\" /out/verifier.wasm",
      "vector-verification-build",
      `/work/${manifestRelative}`,
      artifact,
    ], { cwd: root, stdio: "inherit" });
    return readFileSync(join(output, "verifier.wasm"));
  } finally {
    rmSync(output, { force: true, recursive: true });
  }
}

export async function optimizeVerificationWasm(rawBytes) {
  const { default: binaryen } = await import("binaryen");
  const optimizerFeatures =
    binaryen.Features.MutableGlobals |
    binaryen.Features.NontrappingFPToInt |
    binaryen.Features.BulkMemory |
    binaryen.Features.SignExt |
    binaryen.Features.ReferenceTypes |
    binaryen.Features.BulkMemoryOpt;
  binaryen.setOptimizeLevel(3);
  binaryen.setShrinkLevel(2);
  const wasmModule = binaryen.readBinary(rawBytes);
  wasmModule.setFeatures(optimizerFeatures);
  wasmModule.optimize();
  wasmModule.runPasses(["reorder-functions"]);
  if (!wasmModule.validate()) {
    wasmModule.dispose();
    throw new Error("Binaryen rejected the optimized verification WASM module.");
  }
  const bytes = Buffer.from(wasmModule.emitBinary());
  wasmModule.dispose();
  return bytes;
}
