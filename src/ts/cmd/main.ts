import { Command } from "commander";
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

registerMailCommand(program);

program.parse();
