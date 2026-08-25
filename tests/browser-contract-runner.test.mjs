import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import {
  BROWSER_CASE_TITLES,
  BROWSER_PROJECTS,
  runBrowserContracts,
} from "../scripts/run-browser-contracts.mjs";

const EXPECTED_PROJECTS = [
  "phone-390",
  "tablet-768",
  "laptop-1366",
  "desktop-1440",
  "full-hd",
];

const passingReport = (project, artifactPath) => ({
  config: {
    projects: BROWSER_PROJECTS.map((name) => ({ name, outputDir: artifactPath })),
  },
  suites: [
    {
      title: "browser-contract.spec.ts",
      specs: BROWSER_CASE_TITLES.map((title) => ({
        title,
        tests: [
          {
            projectName: project,
            status: "expected",
            results: [{ status: "passed", errors: [] }],
          },
        ],
      })),
    },
  ],
  errors: [],
  stats: { expected: BROWSER_CASE_TITLES.length, skipped: 0, unexpected: 0, flaky: 0 },
});

const failedReport = (project, artifactPath, attachments) => ({
  config: {
    projects: BROWSER_PROJECTS.map((name) => ({ name, outputDir: artifactPath })),
  },
  suites: [
    {
      title: "browser-contract.spec.ts",
      specs: [
        {
          title: BROWSER_CASE_TITLES[0],
          tests: [
            {
              projectName: project,
              status: "unexpected",
              results: [{ status: "failed", attachments }],
            },
          ],
        },
        ...BROWSER_CASE_TITLES.slice(1).map((title) => ({
          title,
          tests: [
            {
              projectName: project,
              status: "expected",
              results: [{ status: "passed", errors: [] }],
            },
          ],
        })),
      ],
    },
  ],
  errors: [],
  stats: {
    expected: BROWSER_CASE_TITLES.length - 1,
    skipped: 0,
    unexpected: 1,
    flaky: 0,
  },
});

async function unusedLocalPort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
  return address.port;
}

async function waitForReady(url) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

async function waitForResponse(url) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch {}
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
  throw new Error(`Timed out waiting for listener ${url}.`);
}

async function waitForFile(path) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    try {
      await readFile(path);
      return;
    } catch {}
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
  throw new Error(`Timed out waiting for ${path}.`);
}

test("browser contracts run every governed project once and retain deterministic evidence", async (t) => {
  assert.deepEqual(BROWSER_PROJECTS, EXPECTED_PROJECTS);
  assert.equal(new Set(BROWSER_PROJECTS).size, BROWSER_PROJECTS.length);
  const playwrightConfig = await readFile("playwright.config.ts", "utf8");
  const configuredProjects = [...playwrightConfig.matchAll(/\{ name: "([^"]+)"/g)].map(
    ([, project]) => project,
  );
  assert.deepEqual(BROWSER_PROJECTS, configuredProjects);

  const root = await mkdtemp(join(tmpdir(), "vector-browser-contracts-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const observed = [];
  const result = await runBrowserContracts({
    cwd: root,
    outputRoot: join(root, "outputs", "playwright"),
    runProject: async ({ project, serverLogPath, artifactPath, reportPath }) => {
      observed.push({ project, serverLogPath, artifactPath, reportPath });
      await writeFile(serverLogPath, `${project} server evidence\n`);
      await writeFile(reportPath, JSON.stringify(passingReport(project, artifactPath)));
      return {
        taskExitCode: project === "tablet-768" ? 7 : 0,
        serverExitedEarly: false,
        interruptedBy: null,
      };
    },
  });

  assert.deepEqual(observed.map(({ project }) => project), EXPECTED_PROJECTS);
  assert.equal(result.exitCode, 1);
  assert.equal(result.summary.policy, "RUN_ALL_PROJECTS_ONCE");
  assert.deepEqual(
    result.summary.results.map(({ project, state }) => ({ project, state })),
    EXPECTED_PROJECTS.map((project) => ({
      project,
      state: project === "tablet-768" ? "FAILED" : "PASSED",
    })),
  );
  for (const { project, serverLogPath, artifactPath, reportPath } of observed) {
    assert.equal(serverLogPath, join(root, "outputs", "playwright", "server", `${project}.log`));
    assert.equal(artifactPath, join(root, "outputs", "playwright", "artifacts", project));
    assert.equal(reportPath, join(root, "outputs", "playwright", "reports", `${project}.json`));
    assert.match(await readFile(serverLogPath, "utf8"), /server evidence/);
  }
  assert.deepEqual(
    JSON.parse(
      await readFile(join(root, "outputs", "playwright", "browser-contract-summary.json"), "utf8"),
    ),
    result.summary,
  );
});

test("browser project admission requires the exact ordered governed inventory", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "vector-browser-contracts-project-admission-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputRoot = join(root, "outputs", "playwright");
  for (const projects of [
    ["phone-390"],
    [...BROWSER_PROJECTS].reverse(),
    BROWSER_PROJECTS.map((project, index) => (index === 1 ? "phone-390" : project)),
    BROWSER_PROJECTS.map((project, index) => (index === 0 ? "unknown-viewport" : project)),
    BROWSER_PROJECTS.map((project, index) => (index === 0 ? "../../outside" : project)),
  ]) {
    await assert.rejects(
      runBrowserContracts({ cwd: root, outputRoot, projects }),
      /exactly match the governed viewport inventory in order/i,
    );
  }
  await assert.rejects(readFile(join(root, "outside")), /ENOENT/);
});

test("browser contracts fail closed on an early server exit or missing retained log", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "vector-browser-contracts-failure-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await runBrowserContracts({
    cwd: root,
    outputRoot: join(root, "outputs", "playwright"),
    runProject: async () => ({
      taskExitCode: 0,
      serverExitedEarly: true,
      interruptedBy: null,
    }),
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.summary.results.length, BROWSER_PROJECTS.length);
  assert.deepEqual(
    {
      project: result.summary.results[0].project,
      state: result.summary.results[0].state,
      serverExitedEarly: result.summary.results[0].serverExitedEarly,
      evidenceKind: result.summary.results[0].evidenceKind,
      failureEvidenceValid: result.summary.results[0].failureEvidenceValid,
    },
    {
      project: "phone-390",
      state: "FAILED",
      serverExitedEarly: true,
      evidenceKind: "INFRASTRUCTURE_FAILURE",
      failureEvidenceValid: false,
    },
  );
});

test("empty server output and malformed Playwright JSON cannot be admitted as a pass", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "vector-browser-contracts-invalid-evidence-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await runBrowserContracts({
    cwd: root,
    outputRoot: join(root, "outputs", "playwright"),
    runProject: async ({ serverLogPath, reportPath }) => {
      await writeFile(serverLogPath, "");
      await writeFile(reportPath, "not-json");
      return { taskExitCode: 0, serverExitedEarly: false, interruptedBy: null };
    },
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.summary.results[0].state, "FAILED");
  assert.equal(result.summary.results[0].serverLogValid, false);
  assert.equal(result.summary.results[0].reportValid, false);
});

test("contradictory errors and duplicate case identities cannot be admitted as a pass", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "vector-browser-contracts-contradiction-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const mutation of [
    (report) => report.errors.push({ message: "fatal despite passing statuses" }),
    (report) => {
      report.suites[0].specs[0].tests[0].results[0].error = { message: "hidden failure" };
    },
    (report) => {
      report.suites[0].specs[1].title = report.suites[0].specs[0].title;
    },
    (report) => {
      for (const spec of report.suites[0].specs) spec.title = [spec.title];
    },
    (report) => {
      report.config.projects.find(({ name }) => name === "tablet-768").outputDir = "/tmp/wrong";
    },
  ]) {
    const result = await runBrowserContracts({
      cwd: root,
      outputRoot: join(root, "outputs", "playwright"),
      runProject: async ({ project, serverLogPath, reportPath, artifactPath }) => {
        const report = passingReport(project, artifactPath);
        mutation(report);
        await writeFile(serverLogPath, "wrangler evidence\n");
        await writeFile(reportPath, JSON.stringify(report));
        return { taskExitCode: 0, serverExitedEarly: false, interruptedBy: null };
      },
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.summary.results[0].reportValid, false);
  }
});

test("an external interruption stops before later browser projects", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "vector-browser-contracts-interrupt-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const observed = [];
  const result = await runBrowserContracts({
    cwd: root,
    outputRoot: join(root, "outputs", "playwright"),
    runProject: async ({ project, serverLogPath }) => {
      observed.push(project);
      await writeFile(serverLogPath, "interrupted server\n");
      return { taskExitCode: 1, serverExitedEarly: false, interruptedBy: "SIGTERM" };
    },
  });

  assert.deepEqual(observed, ["phone-390"]);
  assert.equal(result.exitCode, 1);
  assert.equal(result.summary.completedAllProjects, false);
});

test("browser-test failure evidence requires retained trace, screenshot, and video", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "vector-browser-contracts-artifacts-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputRoot = join(root, "outputs", "playwright");
  const missing = await runBrowserContracts({
    cwd: root,
    outputRoot,
    runProject: async ({ project, serverLogPath, reportPath, artifactPath }) => {
      await writeFile(serverLogPath, "wrangler failure evidence\n");
      await writeFile(reportPath, JSON.stringify(failedReport(project, artifactPath, [])));
      return { taskExitCode: 1, serverExitedEarly: false, interruptedBy: null };
    },
  });
  assert.equal(missing.summary.results[0].evidenceKind, "TEST_FAILURE");
  assert.equal(missing.summary.results[0].failureEvidenceValid, false);

  const retained = await runBrowserContracts({
    cwd: root,
    outputRoot,
    runProject: async ({ project, serverLogPath, reportPath, artifactPath }) => {
      const attachmentPaths = Object.fromEntries(
        ["trace", "screenshot", "video"].map((name) => [
          name,
          join(artifactPath, `${name}.evidence`),
        ]),
      );
      for (const path of Object.values(attachmentPaths)) await writeFile(path, "retained\n");
      await writeFile(serverLogPath, "wrangler failure evidence\n");
      await writeFile(
        reportPath,
        JSON.stringify(
          failedReport(
            project,
            artifactPath,
            Object.entries(attachmentPaths).map(([name, path]) => ({ name, path })),
          ),
        ),
      );
      return { taskExitCode: 1, serverExitedEarly: false, interruptedBy: null };
    },
  });
  assert.equal(retained.exitCode, 1);
  assert.equal(retained.summary.results[0].failureEvidenceValid, true);
});

test("a Playwright harness failure is a closed non-browser evidence variant", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "vector-browser-contracts-harness-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await runBrowserContracts({
    cwd: root,
    outputRoot: join(root, "outputs", "playwright"),
    runProject: async ({ serverLogPath, reportPath, artifactPath }) => {
      await writeFile(serverLogPath, "wrangler stayed observable\n");
      await writeFile(
        reportPath,
        JSON.stringify({
          config: {
            projects: BROWSER_PROJECTS.map((name) => ({ name, outputDir: artifactPath })),
          },
          suites: [],
          errors: [{ message: "browser failed before test execution" }],
          stats: { expected: 0, skipped: 0, unexpected: 0, flaky: 0 },
        }),
      );
      return { taskExitCode: 1, serverExitedEarly: false, interruptedBy: null };
    },
  });
  assert.equal(result.summary.results[0].evidenceKind, "HARNESS_FAILURE");
  assert.equal(result.summary.results[0].failureEvidenceValid, true);
});

test("failure attachments cannot escape their project directory through symlinks", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "vector-browser-contracts-symlink-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await runBrowserContracts({
    cwd: root,
    outputRoot: join(root, "outputs", "playwright"),
    runProject: async ({ project, serverLogPath, reportPath, artifactPath }) => {
      const outside = join(root, "outside.evidence");
      await writeFile(outside, "external\n");
      const attachments = [];
      for (const name of ["trace", "screenshot", "video"]) {
        const path = join(artifactPath, `${name}.evidence`);
        await symlink(outside, path);
        attachments.push({ name, path });
      }
      await writeFile(serverLogPath, "wrangler failure evidence\n");
      await writeFile(
        reportPath,
        JSON.stringify(failedReport(project, artifactPath, attachments)),
      );
      return { taskExitCode: 1, serverExitedEarly: false, interruptedBy: null };
    },
  });
  assert.equal(result.exitCode, 1);
  assert.equal(result.summary.results[0].failureEvidenceValid, false);
});

test("the project artifact root cannot be replaced by a symlink", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "vector-browser-contracts-root-symlink-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outside = join(root, "outside-project");
  await mkdir(outside);
  const result = await runBrowserContracts({
    cwd: root,
    outputRoot: join(root, "outputs", "playwright"),
    runProject: async ({ project, serverLogPath, reportPath, artifactPath }) => {
      await rm(artifactPath, { recursive: true, force: true });
      await symlink(outside, artifactPath);
      const attachments = [];
      for (const name of ["trace", "screenshot", "video"]) {
        const path = join(artifactPath, `${name}.evidence`);
        await writeFile(path, `${name}\n`);
        attachments.push({ name, path });
      }
      await writeFile(serverLogPath, "wrangler failure evidence\n");
      await writeFile(
        reportPath,
        JSON.stringify(failedReport(project, artifactPath, attachments)),
      );
      return { taskExitCode: 1, serverExitedEarly: false, interruptedBy: null };
    },
  });
  assert.equal(result.exitCode, 1);
  assert.equal(result.summary.results[0].reportValid, false);
  assert.equal(result.summary.results[0].failureEvidenceValid, false);
  for (const name of ["trace", "screenshot", "video"]) {
    assert.equal(await readFile(join(outside, `${name}.evidence`), "utf8"), `${name}\n`);
  }
});

test("governed log, report, and summary paths cannot be alternate filesystem links", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "vector-browser-contracts-evidence-links-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  for (const kind of ["server-log", "report"]) {
    const outputRoot = join(root, kind, "outputs", "playwright");
    const outside = join(root, `${kind}.outside`);
    const result = await runBrowserContracts({
      cwd: root,
      outputRoot,
      runProject: async ({ project, serverLogPath, reportPath, artifactPath }) => {
        const report = JSON.stringify(passingReport(project, artifactPath));
        if (kind === "server-log") {
          await writeFile(outside, "external server evidence\n");
          await symlink(outside, serverLogPath);
          await writeFile(reportPath, report);
        } else {
          await writeFile(serverLogPath, "wrangler evidence\n");
          await writeFile(outside, report);
          await symlink(outside, reportPath);
        }
        return { taskExitCode: 0, serverExitedEarly: false, interruptedBy: null };
      },
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.summary.results[0].state, "FAILED");
  }

  const outputRoot = join(root, "summary", "outputs", "playwright");
  const outsideSummary = join(root, "summary.outside");
  const externalContents = "external summary target\n";
  await assert.rejects(
    runBrowserContracts({
      cwd: root,
      outputRoot,
      runProject: async ({ project, serverLogPath, reportPath, artifactPath }) => {
        await writeFile(serverLogPath, "wrangler evidence\n");
        await writeFile(reportPath, JSON.stringify(passingReport(project, artifactPath)));
        await writeFile(outsideSummary, externalContents);
        await symlink(outsideSummary, join(outputRoot, "browser-contract-summary.json"));
        return { taskExitCode: 0, serverExitedEarly: false, interruptedBy: null };
      },
    }),
    /summary path/i,
  );
  assert.equal(await readFile(outsideSummary, "utf8"), externalContents);
});

test("governed evidence rejects hard links and replaced directory roots", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "vector-browser-contracts-path-swap-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  for (const kind of ["server-log", "report"]) {
    const outputRoot = join(root, `hard-${kind}`, "outputs", "playwright");
    const outside = join(root, `hard-${kind}.outside`);
    const result = await runBrowserContracts({
      cwd: root,
      outputRoot,
      runProject: async ({ project, serverLogPath, reportPath, artifactPath }) => {
        const report = JSON.stringify(passingReport(project, artifactPath));
        if (kind === "server-log") {
          await writeFile(outside, "external server evidence\n");
          await link(outside, serverLogPath);
          await writeFile(reportPath, report);
        } else {
          await writeFile(serverLogPath, "wrangler evidence\n");
          await writeFile(outside, report);
          await link(outside, reportPath);
        }
        return { taskExitCode: 0, serverExitedEarly: false, interruptedBy: null };
      },
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.summary.results[0].state, "FAILED");
  }

  for (const directory of ["server", "reports", "artifacts"]) {
    const outputRoot = join(root, `swap-${directory}`, "outputs", "playwright");
    const outside = join(root, `swap-${directory}.outside`);
    await mkdir(outside);
    const marker = join(outside, "marker.txt");
    await writeFile(marker, "external directory\n");
    await assert.rejects(
      runBrowserContracts({
        cwd: root,
        outputRoot,
        runProject: async ({ project, serverLogPath, reportPath, artifactPath }) => {
          if (directory !== "server") await writeFile(serverLogPath, "wrangler evidence\n");
          if (directory !== "reports") {
            await writeFile(reportPath, JSON.stringify(passingReport(project, artifactPath)));
          }
          await rm(join(outputRoot, directory), { recursive: true, force: true });
          await symlink(outside, join(outputRoot, directory));
          return { taskExitCode: 0, serverExitedEarly: false, interruptedBy: null };
        },
      }),
      /invalid governed directory/i,
    );
    assert.equal(await readFile(marker, "utf8"), "external directory\n");
  }
});

test("SIGTERM stops the active managed group, skips later projects, and releases its port", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "vector-browser-contracts-sigterm-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const port = await unusedLocalPort();
  const observedPath = join(root, "observed.txt");
  const taskReadyPath = join(root, "task-ready.txt");
  const launcherPath = join(root, "launcher.mjs");
  const runnerUrl = pathToFileURL(resolve("scripts/run-browser-contracts.mjs")).href;
  const managedUrl = pathToFileURL(resolve("scripts/run-managed-server.mjs")).href;
  const serverProgram = [
    "const http = require('node:http');",
    `const server = http.createServer((_request, response) => response.end('ready')).listen(${port}, '127.0.0.1');`,
    "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
  ].join("");
  const launcher = `
    import { appendFile } from "node:fs/promises";
    import { runBrowserContracts } from ${JSON.stringify(runnerUrl)};
    import { runManagedServer } from ${JSON.stringify(managedUrl)};
    const result = await runBrowserContracts({
      cwd: ${JSON.stringify(root)},
      outputRoot: ${JSON.stringify(join(root, "outputs", "playwright"))},
      runProject: async ({ project, serverLogPath }) => {
        await appendFile(${JSON.stringify(observedPath)}, project + "\\n");
        return runManagedServer({
          cwd: ${JSON.stringify(root)},
          server: { command: process.execPath, args: ["-e", ${JSON.stringify(serverProgram)}] },
          task: { command: process.execPath, args: ["-e", ${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(taskReadyPath)}, 'ready'); setInterval(() => {}, 1000);`)}] },
          logPath: serverLogPath,
          readyUrl: ${JSON.stringify(`http://127.0.0.1:${port}`)},
          startupTimeoutMs: 2000,
          shutdownTimeoutMs: 1000,
        });
      },
    });
    process.exitCode = result.exitCode;
  `;
  await writeFile(launcherPath, launcher);
  const child = spawn(process.execPath, [launcherPath], { stdio: ["ignore", "pipe", "pipe"] });
  await waitForReady(`http://127.0.0.1:${port}`);
  await waitForFile(taskReadyPath);
  child.kill("SIGTERM");
  const [code, signal] = await once(child, "exit");
  assert.equal(signal, null);
  assert.equal(code, 1);
  assert.equal(await readFile(observedPath, "utf8"), "phone-390\n");

  const probe = createServer();
  probe.listen(port, "127.0.0.1");
  await once(probe, "listening");
  await new Promise((resolveClose, reject) =>
    probe.close((error) => (error ? reject(error) : resolveClose())),
  );
});

test("SIGTERM before readiness remains structured and never starts the next project", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "vector-browser-contracts-preready-sigterm-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const port = await unusedLocalPort();
  const observedPath = join(root, "observed.txt");
  const launcherPath = join(root, "launcher.mjs");
  const runnerUrl = pathToFileURL(resolve("scripts/run-browser-contracts.mjs")).href;
  const managedUrl = pathToFileURL(resolve("scripts/run-managed-server.mjs")).href;
  const serverProgram = [
    "const http = require('node:http');",
    `const server = http.createServer((_request, response) => { response.statusCode = 503; response.end('starting'); }).listen(${port}, '127.0.0.1');`,
    "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
  ].join("");
  const launcher = `
    import { appendFile, writeFile } from "node:fs/promises";
    import { runBrowserContracts } from ${JSON.stringify(runnerUrl)};
    import { runManagedServer } from ${JSON.stringify(managedUrl)};
    const result = await runBrowserContracts({
      cwd: ${JSON.stringify(root)},
      outputRoot: ${JSON.stringify(join(root, "outputs", "playwright"))},
      runProject: async ({ project, serverLogPath }) => {
        await appendFile(${JSON.stringify(observedPath)}, project + "\\n");
        if (project === "tablet-768") {
          await writeFile(serverLogPath, "should-not-run\\n");
          return { taskExitCode: 1, serverExitedEarly: false, interruptedBy: null };
        }
        return runManagedServer({
          cwd: ${JSON.stringify(root)},
          server: { command: process.execPath, args: ["-e", ${JSON.stringify(serverProgram)}] },
          task: { command: process.execPath, args: ["-e", "setInterval(() => {}, 1000)"] },
          logPath: serverLogPath,
          readyUrl: ${JSON.stringify(`http://127.0.0.1:${port}`)},
          startupTimeoutMs: 10000,
          shutdownTimeoutMs: 1000,
        });
      },
    });
    process.exitCode = result.exitCode;
  `;
  await writeFile(launcherPath, launcher);
  const child = spawn(process.execPath, [launcherPath], { stdio: ["ignore", "pipe", "pipe"] });
  await waitForResponse(`http://127.0.0.1:${port}`);
  child.kill("SIGTERM");
  const [code, signal] = await once(child, "exit");
  assert.equal(signal, null);
  assert.equal(code, 1);
  assert.equal(await readFile(observedPath, "utf8"), "phone-390\n");

  const probe = createServer();
  probe.listen(port, "127.0.0.1");
  await once(probe, "listening");
  await new Promise((resolveClose, reject) =>
    probe.close((error) => (error ? reject(error) : resolveClose())),
  );
});
