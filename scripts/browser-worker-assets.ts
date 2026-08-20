import { readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Vinext emits browser Worker assets into this public client directory. The
 * verifier deliberately uses this declared build location rather than a
 * recursive search, so an unexpected output layout fails visibly.
 */
export const VINEXT_BROWSER_WORKER_ASSET_DIRECTORY = "dist/client/_next/static";

type BrowserWorkerAssets = {
  assetDirectory: string;
  simulationWorkerName: string;
  environmentWorkerName: string;
};

function exactlyOneAsset(assetDirectory: string, expression: RegExp, label: string) {
  let names: string[];
  try {
    names = readdirSync(assetDirectory).filter((name) => expression.test(name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Build the production browser Workers before verification: ${assetDirectory} is missing.`,
      );
    }
    throw error;
  }
  if (names.length !== 1) {
    throw new Error(
      `Expected exactly one ${label} asset in ${assetDirectory}; found ${names.length}.`,
    );
  }
  return names[0];
}

export function resolveBrowserWorkerAssets(
  buildRoot = process.cwd(),
): BrowserWorkerAssets {
  const assetDirectory = resolve(buildRoot, VINEXT_BROWSER_WORKER_ASSET_DIRECTORY);
  return {
    assetDirectory,
    simulationWorkerName: exactlyOneAsset(
      assetDirectory,
      /^simulation\.worker-[A-Za-z0-9_-]+\.js$/,
      "simulation Worker",
    ),
    environmentWorkerName: exactlyOneAsset(
      assetDirectory,
      /^environment-sampler\.worker-[A-Za-z0-9_-]+\.js$/,
      "environment Worker",
    ),
  };
}
