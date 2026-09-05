import { createHash } from "node:crypto";
import {
  cpSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

export const CLOUDFLARE_CANDIDATE_SCHEMA = "vector.cloudflare-worker-candidate.v1";
const MANIFEST_NAME = "cloudflare-candidate.json";
const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT_SHA = /^[0-9a-f]{40}$/u;

const invariant = (condition, message) => {
  if (!condition) throw new Error(message);
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const lexicalCompare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

function normalizePath(path) {
  invariant(typeof path === "string" && path.length > 0, "candidate path is empty");
  invariant(!path.startsWith("/") && !path.includes("\\"), `candidate path is not relative POSIX: ${path}`);
  invariant(path.split("/").every((part) => part && part !== "." && part !== ".."), `candidate path is unsafe: ${path}`);
  return path;
}

function walk(root, directory = root) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => lexicalCompare(left.name, right.name))) {
    const absolute = resolve(directory, entry.name);
    const path = relative(root, absolute).split(sep).join("/");
    if (entry.isSymbolicLink()) throw new Error(`candidate contains symbolic link: ${path}`);
    if (entry.isDirectory()) files.push(...walk(root, absolute));
    else if (entry.isFile()) files.push(normalizePath(path));
    else throw new Error(`candidate contains unsupported entry: ${path}`);
  }
  return files.sort(lexicalCompare);
}

function normalizedWranglerConfig(source) {
  const config = structuredClone(source);
  delete config.configPath;
  delete config.userConfigPath;
  delete config.vars;
  config.main = "index.js";
  config.routes = [];
  config.assets = { ...config.assets, directory: "../client" };
  config.no_bundle = true;
  config.hyperdrive = (config.hyperdrive ?? []).map((binding) => {
    const normalized = { ...binding, id: "00000000000000000000000000000000" };
    delete normalized.localConnectionString;
    return normalized;
  });
  return config;
}

function copyDirectory(source, destination, { exclude = new Set() } = {}) {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (exclude.has(entry.name)) continue;
    const from = resolve(source, entry.name);
    const to = resolve(destination, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`source artifact contains symbolic link: ${from}`);
    if (entry.isDirectory()) copyDirectory(from, to);
    else if (entry.isFile()) cpSync(from, to);
    else throw new Error(`source artifact contains unsupported entry: ${from}`);
  }
}

export function createCloudflareCandidate({ projectRoot, outputRoot, sourceSha }) {
  invariant(COMMIT_SHA.test(sourceSha), "candidate source SHA must contain exactly 40 lowercase hexadecimal characters");
  const root = resolve(projectRoot);
  const output = resolve(outputRoot);
  invariant(output !== root && output.startsWith(`${root}${sep}`), "candidate output must be a bounded directory below the project root");
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });

  copyDirectory(resolve(root, "dist/server"), resolve(output, "dist/server"), {
    exclude: new Set([".dev.vars", "wrangler.json"]),
  });
  copyDirectory(resolve(root, "dist/client"), resolve(output, "dist/client"));
  for (const name of ["migrate-db.mjs", "verify-db-migration-ledger.mjs", "verify-db.mjs"]) {
    const source = resolve(root, "dist/admin", name);
    invariant(lstatSync(source).isFile(), `required administration bundle is missing: dist/admin/${name}`);
    const destination = resolve(output, "dist/admin", name);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination);
  }
  copyDirectory(resolve(root, "db/migrations"), resolve(output, "db/migrations"));

  const generatedConfig = JSON.parse(readFileSync(resolve(root, "dist/server/wrangler.json"), "utf8"));
  writeFileSync(
    resolve(output, "dist/server/wrangler.json"),
    `${JSON.stringify(normalizedWranglerConfig(generatedConfig), null, 2)}\n`,
  );

  const files = walk(output).map((path) => {
    const bytes = readFileSync(resolve(output, path));
    return { path, byteLength: bytes.length, sha256: sha256(bytes) };
  });
  const manifest = {
    schemaVersion: CLOUDFLARE_CANDIDATE_SCHEMA,
    sourceSha,
    files,
  };
  writeFileSync(resolve(output, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function verifyCloudflareCandidate({ candidateRoot, expectedSourceSha }) {
  invariant(COMMIT_SHA.test(expectedSourceSha), "expected source SHA must contain exactly 40 lowercase hexadecimal characters");
  const root = resolve(candidateRoot);
  const manifest = JSON.parse(readFileSync(resolve(root, MANIFEST_NAME), "utf8"));
  invariant(manifest.schemaVersion === CLOUDFLARE_CANDIDATE_SCHEMA, "candidate schema is unsupported");
  invariant(manifest.sourceSha === expectedSourceSha, "candidate source SHA does not match the admitted revision");
  invariant(Array.isArray(manifest.files) && manifest.files.length > 0, "candidate file inventory is empty");

  const actualPaths = walk(root).filter((path) => path !== MANIFEST_NAME);
  const declaredPaths = manifest.files.map(({ path }) => normalizePath(path));
  invariant(JSON.stringify(declaredPaths) === JSON.stringify([...declaredPaths].sort()), "candidate file inventory is not sorted");
  invariant(new Set(declaredPaths).size === declaredPaths.length, "candidate file inventory contains duplicates");
  invariant(JSON.stringify(actualPaths) === JSON.stringify(declaredPaths), "candidate file inventory differs from the extracted artifact");

  for (const descriptor of manifest.files) {
    invariant(Number.isInteger(descriptor.byteLength) && descriptor.byteLength >= 0, `candidate byte length is invalid: ${descriptor.path}`);
    invariant(SHA256.test(descriptor.sha256), `candidate digest is invalid: ${descriptor.path}`);
    const bytes = readFileSync(resolve(root, descriptor.path));
    invariant(bytes.length === descriptor.byteLength, `candidate byte length differs: ${descriptor.path}`);
    invariant(sha256(bytes) === descriptor.sha256, `candidate digest differs: ${descriptor.path}`);
    invariant(!/(?:^|\/)(?:\.dev\.vars|\.wrangler|node_modules)(?:\/|$)/u.test(descriptor.path), `candidate contains forbidden deployment state: ${descriptor.path}`);
  }

  for (const required of [
    "dist/server/index.js",
    "dist/server/wrangler.json",
    "dist/client/vendor/maplibre/maplibre-gl-worker.mjs",
    "dist/client/vendor/maplibre/maplibre-gl-shared.mjs",
    "dist/admin/migrate-db.mjs",
    "dist/admin/verify-db-migration-ledger.mjs",
    "dist/admin/verify-db.mjs",
  ]) invariant(declaredPaths.includes(required), `candidate is missing ${required}`);
  invariant(declaredPaths.some((path) => path.startsWith("db/migrations/") && path.endsWith(".sql")), "candidate contains no migrations");

  const config = JSON.parse(readFileSync(resolve(root, "dist/server/wrangler.json"), "utf8"));
  invariant(config.no_bundle === true && config.main === "index.js", "candidate is not a prebuilt no-bundle Worker");
  invariant(config.assets?.directory === "../client", "candidate static asset directory is invalid");
  invariant(JSON.stringify(config.routes ?? []) === "[]", "candidate contains environment-specific routes");
  invariant(config.vars === undefined, "candidate contains environment-specific variables");
  invariant((config.hyperdrive ?? []).every((binding) => binding.id === "00000000000000000000000000000000" && binding.localConnectionString === undefined), "candidate contains environment-specific Hyperdrive state");
  invariant(!JSON.stringify(config).includes(root), "candidate configuration contains an absolute build path");
  return manifest;
}

export function prepareCloudflareDeployment({ candidateRoot, outputPath, expectedSourceSha, hyperdriveId, productionHost }) {
  const manifest = verifyCloudflareCandidate({ candidateRoot, expectedSourceSha });
  invariant(/^[0-9a-f]{32}$/u.test(hyperdriveId), "production Hyperdrive ID is invalid");
  invariant(typeof productionHost === "string" && /^[a-z0-9.-]+$/u.test(productionHost) && !productionHost.startsWith(".") && !productionHost.endsWith("."), "production host is invalid");
  const candidate = resolve(candidateRoot);
  const output = resolve(outputPath);
  const config = JSON.parse(readFileSync(resolve(candidate, "dist/server/wrangler.json"), "utf8"));
  const configDirectory = dirname(output);
  const relativeFromConfig = (target) => relative(configDirectory, target).split(sep).join("/");
  config.main = relativeFromConfig(resolve(candidate, "dist/server/index.js"));
  config.assets.directory = relativeFromConfig(resolve(candidate, "dist/client"));
  config.routes = [{ pattern: productionHost, custom_domain: true }];
  config.hyperdrive = config.hyperdrive.map((binding) => ({ ...binding, id: hyperdriveId }));
  config.vars = {
    VECTOR_SOURCE_REVISION: manifest.sourceSha,
    VECTOR_CANDIDATE_MANIFEST_SHA256: sha256(readFileSync(resolve(candidate, MANIFEST_NAME))),
  };
  mkdirSync(configDirectory, { recursive: true });
  writeFileSync(output, `${JSON.stringify(config, null, 2)}\n`);
  return config;
}
