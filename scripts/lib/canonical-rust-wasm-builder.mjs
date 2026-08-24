import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import process from "node:process";

export const CANONICAL_RUST_PLATFORM = "linux/amd64";
export const CANONICAL_RUST_BUILDER = "docker.io/library/rust:1.97.1-bookworm@sha256:408fe88047cef61a2087653b0c5255fa51c0f2d6d94ddedd7a2562a9b91a46f6";

const MAX_UNIX_ID = 2_147_483_647;
const SAFE_REPOSITORY_PATH = /^[A-Za-z0-9._/-]+$/;
const SAFE_TEMPORARY_PREFIX = /^[a-z0-9-]+$/;

function assertRepositoryRelativePath(value, label) {
  if (typeof value !== "string"
    || value.length === 0
    || isAbsolute(value)
    || value.split("/").includes("..")
    || !SAFE_REPOSITORY_PATH.test(value)) {
    throw new Error(`${label} must be a confined repository-relative path.`);
  }
}

export function canonicalTargetOwnershipCommand({ uid, gid } = {}) {
  if (uid === undefined && gid === undefined) return ":";
  if (!Number.isSafeInteger(uid)
    || !Number.isSafeInteger(gid)
    || uid < 0
    || gid < 0
    || uid > MAX_UNIX_ID
    || gid > MAX_UNIX_ID) {
    throw new Error("Canonical builder host uid/gid must be paired non-negative integers.");
  }
  return `chown -R -- ${uid}:${gid} /target`;
}

function currentHostIdentity() {
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  const gid = typeof process.getgid === "function" ? process.getgid() : undefined;
  return { uid, gid };
}

export function buildCanonicalRustWasm({
  root,
  manifestPath,
  outputPath,
  temporaryRoot = tmpdir(),
  temporaryPrefix,
  hostIdentity = currentHostIdentity(),
  execute = execFileSync,
  read = readFileSync,
  cleanup = rmSync,
  missingDockerMessage = "Docker was not found on PATH. Canonical Rust/WASM generation requires its pinned linux/amd64 builder.",
}) {
  if (typeof root !== "string" || !isAbsolute(root)) {
    throw new Error("Canonical builder root must be an absolute path.");
  }
  assertRepositoryRelativePath(manifestPath, "Canonical builder manifestPath");
  assertRepositoryRelativePath(outputPath, "Canonical builder outputPath");
  if (typeof temporaryRoot !== "string" || !isAbsolute(temporaryRoot)) {
    throw new Error("Canonical builder temporaryRoot must be an absolute path.");
  }
  if (typeof temporaryPrefix !== "string" || !SAFE_TEMPORARY_PREFIX.test(temporaryPrefix)) {
    throw new Error("Canonical builder temporaryPrefix is invalid.");
  }

  const ownershipCommand = canonicalTargetOwnershipCommand(hostIdentity);
  const target = mkdtempSync(join(temporaryRoot, temporaryPrefix));
  const shellCommand = [
    "set -eu",
    `restore_target_ownership() { ${ownershipCommand}; }`,
    "trap restore_target_ownership EXIT",
    "rustup target add wasm32-unknown-unknown",
    "CARGO_TARGET_DIR=/target cargo build --locked --release"
      + " --target wasm32-unknown-unknown"
      + ` --manifest-path ${manifestPath}`,
    "restore_target_ownership",
    "trap - EXIT",
  ].join("\n");

  try {
    execute("docker", [
      "run",
      "--rm",
      "--platform",
      CANONICAL_RUST_PLATFORM,
      "--volume",
      `${root}:/work:ro`,
      "--volume",
      `${target}:/target`,
      "--workdir",
      "/work",
      CANONICAL_RUST_BUILDER,
      "bash",
      "-c",
      shellCommand,
    ], { cwd: root, stdio: "inherit" });
    return read(join(target, outputPath));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(missingDockerMessage);
    }
    throw error;
  } finally {
    cleanup(target, { recursive: true, force: true });
  }
}
