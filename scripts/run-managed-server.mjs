import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const isPosix = process.platform !== "win32";
const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function exitOf(processHandle) {
  return new Promise((resolve, reject) => {
    processHandle.once("error", reject);
    // `close` follows process exit and closure of its stdio streams. Waiting for
    // it prevents the final server diagnostics from racing the retained log.
    processHandle.once("close", (code, signal) => resolve({ code, signal }));
  });
}

function signalProcessGroup(processHandle, signal) {
  if (processHandle.exitCode !== null || processHandle.signalCode !== null) return;
  try {
    if (isPosix && processHandle.pid) process.kill(-processHandle.pid, signal);
    else processHandle.kill(signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

async function terminateProcessGroup(processHandle, exitPromise, timeoutMs) {
  if (processHandle.exitCode !== null || processHandle.signalCode !== null) {
    return exitPromise;
  }
  signalProcessGroup(processHandle, "SIGTERM");
  const outcome = await Promise.race([
    exitPromise.then((exit) => ({ kind: "exit", exit })),
    delay(timeoutMs).then(() => ({ kind: "timeout" })),
  ]);
  if (outcome.kind === "exit") return outcome.exit;
  signalProcessGroup(processHandle, "SIGKILL");
  return exitPromise;
}

async function waitForReady(url, serverProcess, timeoutMs, interrupted) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (interrupted.signal) {
      throw new Error(`Managed server interrupted by ${interrupted.signal}.`);
    }
    if (serverProcess.exitCode !== null || serverProcess.signalCode !== null) {
      throw new Error("Managed server exited before it became ready.");
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`Managed server readiness returned ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  throw lastError ?? new Error("Managed server readiness timed out.");
}

/**
 * Run one bounded verification task against a managed background server.
 * Server output is retained at logPath and the complete process group is
 * stopped and awaited on success, task failure, server failure, or signal.
 */
export async function runManagedServer({
  server,
  task,
  logPath,
  readyUrl,
  startupTimeoutMs = 90_000,
  shutdownTimeoutMs = 5_000,
  cwd = process.cwd(),
  env = process.env,
}) {
  await mkdir(dirname(logPath), { recursive: true });
  const log = createWriteStream(logPath, { flags: "w" });
  const serverProcess = spawn(server.command, server.args ?? [], {
    cwd,
    env,
    detached: isPosix,
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProcess.stdout.pipe(log, { end: false });
  serverProcess.stderr.pipe(log, { end: false });
  const serverExit = exitOf(serverProcess);
  const interrupted = { signal: null };
  let taskProcess;
  let taskExit;
  const handleSignal = (signal) => {
    interrupted.signal = signal;
    if (taskProcess) signalProcessGroup(taskProcess, signal);
    signalProcessGroup(serverProcess, signal);
  };
  const handleSigint = () => handleSignal("SIGINT");
  const handleSigterm = () => handleSignal("SIGTERM");
  process.once("SIGINT", handleSigint);
  process.once("SIGTERM", handleSigterm);

  try {
    if (readyUrl) {
      await waitForReady(readyUrl, serverProcess, startupTimeoutMs, interrupted);
    }
    taskProcess = spawn(task.command, task.args ?? [], {
      cwd,
      env,
      detached: isPosix,
      stdio: "inherit",
    });
    taskExit = exitOf(taskProcess);
    const outcome = await Promise.race([
      taskExit.then((exit) => ({ kind: "task", exit })),
      serverExit.then((exit) => ({ kind: "server", exit })),
    ]);
    if (outcome.kind === "server") {
      await terminateProcessGroup(taskProcess, taskExit, shutdownTimeoutMs);
      return {
        taskExitCode: 1,
        serverExitedEarly: true,
        interruptedBy: interrupted.signal,
      };
    }
    return {
      taskExitCode: outcome.exit.code ?? 1,
      serverExitedEarly: false,
      interruptedBy: interrupted.signal,
    };
  } finally {
    if (taskProcess && taskExit && interrupted.signal) {
      await terminateProcessGroup(taskProcess, taskExit, shutdownTimeoutMs);
    }
    await terminateProcessGroup(serverProcess, serverExit, shutdownTimeoutMs);
    process.removeListener("SIGINT", handleSigint);
    process.removeListener("SIGTERM", handleSigterm);
    await new Promise((resolve, reject) => {
      log.once("error", reject);
      log.end(resolve);
    });
  }
}

async function run() {
  const port = process.env.PORT ?? "4317";
  const vectorUrl = process.env.VECTOR_URL ?? `http://127.0.0.1:${port}`;
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = await runManagedServer({
    server: {
      command: npxCommand,
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
    task: { command: npmCommand, args: ["run", "app:verify"] },
    logPath: "outputs/integration/application.log",
    readyUrl: `${vectorUrl}/api/health`,
  });
  if (result.interruptedBy) {
    process.stderr.write(`Managed integration run interrupted by ${result.interruptedBy}.\n`);
  } else if (result.serverExitedEarly) {
    process.stderr.write("Managed integration server exited before verification completed.\n");
  }
  process.exitCode = result.taskExitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
