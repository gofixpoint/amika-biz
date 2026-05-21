import { spawn } from "node:child_process";
import { getGlobalOpts } from "../cmd/main.js";
import { listMailAccounts, loadConfig } from "./config.js";

/**
 * Run `fd` or `rg` against all configured md_box directories.
 * Trailing args are forwarded verbatim; the md_box paths are appended as
 * search roots so the user doesn't have to remember them.
 */
export async function runPassthrough(
  bin: "fd" | "rg",
  args: string[],
): Promise<void> {
  const globalOpts = getGlobalOpts();
  const cfg = loadConfig(globalOpts.config);
  const accounts = listMailAccounts(cfg);
  const roots = accounts
    .map((name) => cfg.mail![name]!.md_box)
    .filter((p) => p && p.length > 0);

  if (roots.length === 0) {
    console.error("No mail accounts configured; nothing to search.");
    process.exit(1);
  }

  const finalArgs = [...args, ...roots];
  const child = spawn(bin, finalArgs, { stdio: "inherit" });
  await new Promise<void>((resolve) => {
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
      }
      process.exit(code ?? 0);
    });
    child.on("error", (err) => {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "ENOENT") {
        console.error(`Could not find \`${bin}\` on PATH. Install it first.`);
        process.exit(127);
      }
      console.error(`Failed to run ${bin}: ${err.message}`);
      process.exit(1);
      resolve();
    });
  });
}
