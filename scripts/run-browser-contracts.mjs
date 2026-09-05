import { lstat, mkdir, open, realpath, rename, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { runManagedServer } from "./run-managed-server.mjs";

export const BROWSER_PROJECTS = Object.freeze([
  "phone-390",
  "tablet-768",
  "laptop-1366",
  "desktop-1440",
  "full-hd",
]);
export const BROWSER_CASES_PER_PROJECT = 19;
export const BROWSER_CASE_TITLES = Object.freeze([
  "a disabled domain link cannot fall through to the A2A workbench",
  "Peace Drive I evidence is visibly context-only and fitted EW remains unknown",
  "public release pages stay simple and contained across supported displays",
  "canonical report debrief remains exact, contained, and printable",
  "the unedited BVR package remains MATCHED across canonical Map and 3D presentation",
  "short-wide BVR playback keeps key-free tiles, labels, controls, and frame-earned copy separate",
  "browser presentation changes only at the canonical target-effect frame",
  "the close-merge WVR effect remains canonical and labels exact authored intent",
  "the BVR Air study keeps every playback and outcome surface on one canonical frame",
  "the WVR Air study keeps every playback and outcome surface on one canonical frame",
  "the transition Air study keeps every playback and outcome surface on one canonical frame",
  "an invalid non-spatial numeric draft cannot be bypassed by changing builder steps",
  "a raw invalid draft discards its in-flight Worker completion",
  "QHD Define uses one readable task measure without a detached action rail",
  "duration and replay seed use governed raw admission before builder navigation",
  "shared transient controls hand off once and remain accessible, contained, and stable",
  "a current deployment manifest drives the real Worker run after route recovery",
  "a Worker-produced VSR downloads and reopens without rerunning physics",
  "the exact Air-combat studies retain bounded Worker and canonical 3D browser performance",
]);

const npmExecutable = process.platform === "win32" ? "npx.cmd" : "npx";

async function governedDirectorySnapshot(outputRoot, artifactPath = null) {
  const serverRoot = join(outputRoot, "server");
  const reportsRoot = join(outputRoot, "reports");
  const artifactRoot = join(outputRoot, "artifacts");
  try {
    const paths = [outputRoot, serverRoot, reportsRoot, artifactRoot];
    if (artifactPath !== null) paths.push(artifactPath);
    const [stats, realPaths] = await Promise.all([
      Promise.all(paths.map((path) => lstat(path))),
      Promise.all(paths.map((path) => realpath(path))),
    ]);
    if (stats.some((stat) => !stat.isDirectory() || stat.isSymbolicLink())) return null;
    if (realPaths[1] !== join(realPaths[0], "server")) return null;
    if (realPaths[2] !== join(realPaths[0], "reports")) return null;
    if (realPaths[3] !== join(realPaths[0], "artifacts")) return null;
    if (artifactPath !== null && realPaths[4] !== join(realPaths[3], basename(artifactPath))) {
      return null;
    }
    return {
      outputRoot,
      outputRealPath: realPaths[0],
      serverRoot,
      serverRealPath: realPaths[1],
      reportsRoot,
      reportsRealPath: realPaths[2],
      artifactRoot,
      artifactRootRealPath: realPaths[3],
      artifactPath,
      artifactRealPath: artifactPath === null ? null : realPaths[4],
      identity: stats.map(({ dev, ino }) => `${dev}:${ino}`).join("/"),
    };
  } catch {
    return null;
  }
}

async function snapshotUnchanged(snapshot) {
  const current = await governedDirectorySnapshot(snapshot.outputRoot, snapshot.artifactPath);
  return Boolean(
    current &&
      current.outputRealPath === snapshot.outputRealPath &&
      current.serverRealPath === snapshot.serverRealPath &&
      current.reportsRealPath === snapshot.reportsRealPath &&
      current.artifactRootRealPath === snapshot.artifactRootRealPath &&
      current.artifactRealPath === snapshot.artifactRealPath &&
      current.identity === snapshot.identity,
  );
}

async function readGovernedFile(snapshot, parentPath, parentRealPath, path) {
  if (!isInside(parentPath, path) || !(await snapshotUnchanged(snapshot))) return null;
  let handle;
  try {
    const [fileRealPath, pathStat] = await Promise.all([realpath(path), lstat(path)]);
    if (
      !pathStat.isFile() ||
      pathStat.isSymbolicLink() ||
      pathStat.nlink !== 1 ||
      !isInside(parentRealPath, fileRealPath)
    ) {
      return null;
    }
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const fileStat = await handle.stat();
    if (
      !fileStat.isFile() ||
      fileStat.nlink !== 1 ||
      fileStat.dev !== pathStat.dev ||
      fileStat.ino !== pathStat.ino
    ) {
      return null;
    }
    const contents = await handle.readFile();
    return (await snapshotUnchanged(snapshot)) ? contents : null;
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
}

async function appendGovernedLog(snapshot, path, contents) {
  if (!isInside(snapshot.serverRoot, path) || !(await snapshotUnchanged(snapshot))) return false;
  let handle;
  try {
    try {
      const pathStat = await lstat(path);
      if (!pathStat.isFile() || pathStat.isSymbolicLink() || pathStat.nlink !== 1) return false;
    } catch (error) {
      if (!(error && typeof error === "object" && error.code === "ENOENT")) return false;
    }
    handle = await open(
      path,
      constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1) return false;
    await handle.writeFile(contents);
    return snapshotUnchanged(snapshot);
  } catch {
    return false;
  } finally {
    await handle?.close();
  }
}

let summaryWriteSequence = 0;

async function assertSummaryDestination(summaryPath) {
  try {
    const stat = await lstat(summaryPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
      throw new Error("Browser contract summary path must be a regular non-link file.");
    }
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return;
    throw error;
  }
}

async function writeGovernedSummary(snapshot, summaryPath, contents) {
  if (
    !isInside(snapshot.outputRoot, summaryPath) ||
    !(await snapshotUnchanged(snapshot))
  ) {
    throw new Error("Browser contract summary path has an invalid governed directory.");
  }
  await assertSummaryDestination(summaryPath);
  const temporaryPath = join(
    snapshot.outputRoot,
    `.browser-contract-summary.${process.pid}.${summaryWriteSequence++}.tmp`,
  );
  let handle;
  try {
    handle = await open(
      temporaryPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    await handle.writeFile(contents);
    await handle.sync();
    await handle.close();
    handle = undefined;
    if (!(await snapshotUnchanged(snapshot))) {
      throw new Error("Browser contract summary directory changed during persistence.");
    }
    await assertSummaryDestination(summaryPath);
    await rename(temporaryPath, summaryPath);
    const persisted = await readGovernedFile(
      snapshot,
      snapshot.outputRoot,
      snapshot.outputRealPath,
      summaryPath,
    );
    if (persisted === null || persisted.toString("utf8") !== contents) {
      throw new Error("Browser contract summary failed canonical readback.");
    }
  } finally {
    await handle?.close();
    await rm(temporaryPath, { force: true });
  }
}

async function retainedRegularFileInside(snapshot, path) {
  if (
    typeof path !== "string" ||
    !isAbsolute(path) ||
    !isInside(snapshot.artifactPath, path)
  ) {
    return false;
  }
  let handle;
  try {
    const [fileRealPath, pathStat] = await Promise.all([realpath(path), lstat(path)]);
    if (
      !pathStat.isFile() ||
      pathStat.isSymbolicLink() ||
      pathStat.nlink !== 1 ||
      !isInside(snapshot.artifactRealPath, fileRealPath)
    ) {
      return false;
    }
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const fileStat = await handle.stat();
    return fileStat.isFile() && fileStat.nlink === 1 && fileStat.size > 0 &&
      fileStat.dev === pathStat.dev && fileStat.ino === pathStat.ino;
  } catch {
    return false;
  } finally {
    await handle?.close();
  }
}

function reportCases(suites) {
  if (!Array.isArray(suites)) return [];
  return suites.flatMap((suite) => [
    ...(Array.isArray(suite?.specs)
      ? suite.specs.flatMap((spec) =>
          Array.isArray(spec?.tests)
            ? spec.tests.map((test) => ({ title: spec?.title, test }))
            : [],
        )
      : []),
    ...reportCases(suite?.suites),
  ]);
}

function isInside(parent, candidate) {
  const child = relative(resolve(parent), resolve(candidate));
  return child !== "" && !child.startsWith("..") && !isAbsolute(child);
}

async function attachmentsAreRetained(tests, outputRoot, artifactPath, snapshot) {
  const failedResults = tests.flatMap((test) =>
    Array.isArray(test?.results)
      ? test.results.filter(({ status }) => status !== "passed" && status !== "skipped")
      : [],
  );
  if (failedResults.length === 0) return false;
  for (const result of failedResults) {
    const attachments = Array.isArray(result?.attachments) ? result.attachments : [];
    for (const name of ["trace", "screenshot", "video"]) {
      const attachment = attachments.find((candidate) => candidate?.name === name);
      if (
        typeof attachment?.path !== "string" ||
        !(await retainedRegularFileInside(snapshot, attachment.path))
      ) {
        return false;
      }
    }
  }
  return snapshotUnchanged(snapshot);
}

async function inspectReport(reportContents, artifactPath, project, directorySnapshot) {
  if (
    reportContents === null ||
    directorySnapshot === null ||
    !(await snapshotUnchanged(directorySnapshot))
  ) {
    return { reportValid: false, caseCount: null, passed: false, failedArtifactsValid: false };
  }
  let report;
  try {
    report = JSON.parse(reportContents.toString("utf8"));
  } catch {
    return { reportValid: false, caseCount: null, passed: false, failedArtifactsValid: false };
  }
  const cases = reportCases(report?.suites);
  const tests = cases.map(({ test }) => test);
  const stats = report?.stats;
  const projectConfig = Array.isArray(report?.config?.projects)
    ? report.config.projects.find((candidate) => candidate?.name === project)
    : undefined;
  const projectDeclared =
    typeof projectConfig?.outputDir === "string" &&
    resolve(projectConfig.outputDir) === resolve(artifactPath);
  const configuredProjectsValid =
    Array.isArray(report?.config?.projects) &&
    report.config.projects.length === BROWSER_PROJECTS.length &&
    new Set(report.config.projects.map(({ name }) => name)).size === report.config.projects.length &&
    [...report.config.projects.map(({ name }) => name)].sort().join("\n") ===
      [...BROWSER_PROJECTS].sort().join("\n") &&
    report.config.projects.every(
      ({ name, outputDir }) =>
        typeof name === "string" &&
        typeof outputDir === "string" &&
        resolve(outputDir) === resolve(artifactPath),
    );
  const caseTitles = cases.map(({ title }) => title);
  const exactCases =
    caseTitles.every((title) => typeof title === "string") &&
    new Set(caseTitles).size === BROWSER_CASE_TITLES.length &&
    [...caseTitles].sort().join("\n") === [...BROWSER_CASE_TITLES].sort().join("\n");
  const topLevelErrorsEmpty = Array.isArray(report?.errors) && report.errors.length === 0;
  const structural =
    projectDeclared &&
    configuredProjectsValid &&
    topLevelErrorsEmpty &&
    tests.length === BROWSER_CASES_PER_PROJECT &&
    exactCases &&
    tests.every(
      (test) =>
        test?.projectName === project &&
        Array.isArray(test?.results) &&
        test.results.every(
          (result) =>
            result?.status !== "passed" ||
            (result?.error == null && Array.isArray(result?.errors) && result.errors.length === 0),
        ),
    ) &&
    stats &&
    ["expected", "skipped", "unexpected", "flaky"].every(
      (key) => Number.isInteger(stats[key]) && stats[key] >= 0,
    ) &&
    stats.expected + stats.skipped + stats.unexpected + stats.flaky === tests.length;
  const harnessFailure =
    projectDeclared &&
    configuredProjectsValid &&
    tests.length === 0 &&
    Array.isArray(report?.errors) &&
    report.errors.length > 0 &&
    stats &&
    ["expected", "skipped", "unexpected", "flaky"].every((key) => stats[key] === 0);
  if (!structural && !harnessFailure) {
    return {
      reportValid: false,
      caseCount: tests.length,
      passed: false,
      harnessFailure: false,
      failedArtifactsValid: false,
    };
  }
  const passed =
    stats.expected === BROWSER_CASES_PER_PROJECT &&
    stats.skipped === 0 &&
    stats.unexpected === 0 &&
    stats.flaky === 0 &&
    tests.every(
      (test) =>
        test.status === "expected" &&
        test.results.length === 1 &&
        test.results[0]?.status === "passed" &&
        test.results[0]?.error == null &&
        Array.isArray(test.results[0]?.errors) &&
        test.results[0].errors.length === 0,
    );
  const failedArtifactsValid = passed
    ? null
    : await attachmentsAreRetained(
        tests,
        directorySnapshot.outputRoot,
        artifactPath,
        directorySnapshot,
      );
  if (!(await snapshotUnchanged(directorySnapshot))) {
    return {
      reportValid: false,
      caseCount: tests.length,
      passed: false,
      harnessFailure: false,
      failedArtifactsValid: false,
    };
  }
  return {
    reportValid: true,
    caseCount: tests.length,
    passed,
    harnessFailure,
    failedArtifactsValid,
  };
}

async function runPlaywrightProject({ cwd, project, outputRoot, serverLogPath, artifactPath, reportPath }) {
  const port = "4319";
  const vectorUrl = `http://127.0.0.1:${port}`;
  await mkdir(artifactPath, { recursive: true });
  await mkdir(join(outputRoot, "reports"), { recursive: true });
  return runManagedServer({
    cwd,
    server: {
      command: npmExecutable,
      args: [
        "wrangler",
        "dev",
        "--config",
        "dist/server/wrangler.json",
        "--ip",
        "127.0.0.1",
        "--port",
        port,
      ],
    },
    task: {
      command: npmExecutable,
      args: [
        "playwright",
        "test",
        `--project=${project}`,
        "--retries=0",
        "--workers=1",
        `--output=${artifactPath}`,
        "--reporter=line,json",
      ],
    },
    logPath: serverLogPath,
    readyUrl: vectorUrl,
    startupTimeoutMs: 180_000,
    env: {
      ...process.env,
      CI: "true",
      VECTOR_URL: vectorUrl,
      PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath,
      WRANGLER_LOG_PATH: join(outputRoot, "server", `${project}.wrangler.log`),
    },
  });
}

function assertProjectList(projects) {
  if (!Array.isArray(projects) || projects.length === 0) {
    throw new Error("Browser contract project list must not be empty.");
  }
  if (projects.some((project) => typeof project !== "string" || !project)) {
    throw new Error("Browser contract project names must be non-empty strings.");
  }
  if (
    projects.length !== BROWSER_PROJECTS.length ||
    projects.some((project, index) => project !== BROWSER_PROJECTS[index])
  ) {
    throw new Error(
      "Browser contract projects must exactly match the governed viewport inventory in order.",
    );
  }
}

/**
 * Run-all is deliberate: one viewport failure must not suppress evidence from
 * later viewports. Each project gets a fresh managed Wrangler process group.
 */
export async function runBrowserContracts({
  cwd = process.cwd(),
  outputRoot = resolve(cwd, "outputs", "playwright"),
  projects = BROWSER_PROJECTS,
  runProject = runPlaywrightProject,
} = {}) {
  assertProjectList(projects);
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(join(outputRoot, "server"), { recursive: true });
  await mkdir(join(outputRoot, "artifacts"), { recursive: true });
  await mkdir(join(outputRoot, "reports"), { recursive: true });
  const rootSnapshot = await governedDirectorySnapshot(outputRoot);
  if (!rootSnapshot) {
    throw new Error("Browser contract output directories are not canonical real directories.");
  }

  const summary = {
    schemaVersion: "vector.browser-contract-run.v1",
    policy: "RUN_ALL_PROJECTS_ONCE",
    projects: [...projects],
    expectedCasesPerProject: BROWSER_CASES_PER_PROJECT,
    completedAllProjects: false,
    results: [],
  };
  const summaryPath = join(outputRoot, "browser-contract-summary.json");

  for (const project of projects) {
    const serverLogPath = join(outputRoot, "server", `${project}.log`);
    const artifactPath = join(outputRoot, "artifacts", project);
    const reportPath = join(outputRoot, "reports", `${project}.json`);
    await mkdir(artifactPath, { recursive: true });
    if (!(await governedDirectorySnapshot(outputRoot, artifactPath))) {
      throw new Error(`Browser contract evidence directories are invalid for ${project}.`);
    }
    let outcome;
    try {
      outcome = await runProject({
        cwd,
        project,
        outputRoot,
        serverLogPath,
        artifactPath,
        reportPath,
      });
    } catch (error) {
      const interruptedBy =
        error && typeof error === "object" &&
        (error.interruptedBy === "SIGINT" || error.interruptedBy === "SIGTERM")
          ? error.interruptedBy
          : null;
      outcome = {
        taskExitCode: 1,
        serverExitedEarly: interruptedBy === null,
        interruptedBy,
      };
      await appendGovernedLog(
        rootSnapshot,
        serverLogPath,
        `Browser project runner failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
    const serverLogContents = await readGovernedFile(
      rootSnapshot,
      rootSnapshot.serverRoot,
      rootSnapshot.serverRealPath,
      serverLogPath,
    );
    const projectSnapshot = await governedDirectorySnapshot(outputRoot, artifactPath);
    const reportContents = await readGovernedFile(
      rootSnapshot,
      rootSnapshot.reportsRoot,
      rootSnapshot.reportsRealPath,
      reportPath,
    );
    const serverLogRetained = serverLogContents !== null;
    const serverLogValid = serverLogRetained && serverLogContents.byteLength > 0;
    const reportRetained = reportContents !== null;
    const report = await inspectReport(reportContents, artifactPath, project, projectSnapshot);
    const infrastructureFailure = Boolean(outcome.serverExitedEarly || outcome.interruptedBy);
    const harnessFailure = outcome.taskExitCode !== 0 && report.harnessFailure;
    const evidenceKind =
      infrastructureFailure
        ? "INFRASTRUCTURE_FAILURE"
        : outcome.taskExitCode === 0
          ? "SUCCESS"
          : harnessFailure
            ? "HARNESS_FAILURE"
            : "TEST_FAILURE";
    const failureEvidenceValid =
      infrastructureFailure
        ? serverLogValid
        : outcome.taskExitCode === 0
          ? null
          : harnessFailure
            ? report.reportValid && serverLogValid
            : report.reportValid && report.failedArtifactsValid === true && serverLogValid;
    const state =
      outcome.taskExitCode === 0 &&
      !outcome.serverExitedEarly &&
      !outcome.interruptedBy &&
      serverLogValid &&
      reportRetained &&
      report.reportValid &&
      report.passed
        ? "PASSED"
        : "FAILED";
    summary.results.push({
      project,
      state,
      taskExitCode: outcome.taskExitCode,
      serverExitedEarly: outcome.serverExitedEarly,
      interruptedBy: outcome.interruptedBy,
      serverLogRetained,
      serverLogValid,
      reportRetained,
      reportValid: report.reportValid,
      caseCount: report.caseCount,
      evidenceKind,
      failureEvidenceValid,
    });
    await writeGovernedSummary(rootSnapshot, summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
    if (outcome.interruptedBy) break;
  }

  summary.completedAllProjects = summary.results.length === projects.length;
  const persistedSummary = `${JSON.stringify(summary, null, 2)}\n`;
  await writeGovernedSummary(rootSnapshot, summaryPath, persistedSummary);

  // Read back the persisted contract before reporting success.
  const readback = await readGovernedFile(
    rootSnapshot,
    rootSnapshot.outputRoot,
    rootSnapshot.outputRealPath,
    summaryPath,
  );
  if (readback === null || readback.toString("utf8") !== persistedSummary) {
    throw new Error("Browser contract summary failed final canonical readback.");
  }
  JSON.parse(readback.toString("utf8"));
  return {
    exitCode: summary.results.every(({ state }) => state === "PASSED") ? 0 : 1,
    summary,
  };
}

async function main() {
  const result = await runBrowserContracts();
  for (const entry of result.summary.results) {
    process.stdout.write(`${entry.project}: ${entry.state}\n`);
  }
  process.exitCode = result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
