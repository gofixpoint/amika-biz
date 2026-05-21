import { WorkOS } from "@workos-inc/node";
import { loadEnvFromRepoRoot } from "./git.js";

export function initWorkOS({ skipEnv = false } = {}): WorkOS {
  if (!skipEnv) {
    loadEnvFromRepoRoot();
  }

  const apiKey = process.env.WORKOS_API_KEY;
  if (!apiKey) {
    throw new Error("Missing WORKOS_API_KEY environment variable.");
  }

  return new WorkOS(apiKey);
}
