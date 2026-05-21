import { Command } from "commander";
import { fetchAllUsers, printUsers, type Format } from "../list-users.js";
import { initWorkOS } from "../workos.js";
import { registerMailCommand } from "./mail.js";
import { DEFAULT_CONFIG_PATH, DEFAULT_STATE_DIR } from "../mail/config.js";

const program = new Command();

program
  .name("biz")
  .description("Fixpoint business CLI")
  .option("--skip-env", "skip loading .env.local (use when env is already set)", false)
  .option("--config <path>", "path to biz config TOML", DEFAULT_CONFIG_PATH)
  .option("--state-dir <path>", "path to biz state dir", DEFAULT_STATE_DIR);

export type GlobalOpts = {
  skipEnv: boolean;
  config: string;
  stateDir: string;
};

export function getGlobalOpts(): GlobalOpts {
  return program.opts<GlobalOpts>();
}

const workosCmd = program
  .command("workos")
  .description("WorkOS management commands");

workosCmd
  .command("list-users")
  .description("List all WorkOS users with organization info")
  .option(
    "--format <format>",
    "output format: json, csv, or table",
    "json",
  )
  .action(async (opts: { format: string }) => {
    const format = opts.format as Format;
    if (!["json", "csv", "table"].includes(format)) {
      console.error(`Unknown format "${format}". Use json, csv, or table.`);
      process.exit(1);
    }
    const globalOpts = getGlobalOpts();
    const workos = initWorkOS({ skipEnv: globalOpts.skipEnv });
    const users = await fetchAllUsers(workos);
    printUsers(users, format);
  });

registerMailCommand(program);

program.parse();
