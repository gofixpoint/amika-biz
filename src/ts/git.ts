import { execSync } from "node:child_process";
import path from "node:path";
import dotenv from "dotenv";

/** Returns the absolute path to the root of the current git repository. */
export function getRepoRoot(): string {
  return execSync("git rev-parse --show-toplevel", {
    encoding: "utf-8",
  }).trim();
}

/**
 * Loads environment variables from `.env.local` at the git repository root.
 * Call this before reading any env vars that live in that file.
 */
export function loadEnvFromRepoRoot(): void {
  const envPath = path.join(getRepoRoot(), ".env.local");
  dotenv.config({ path: envPath });
}
