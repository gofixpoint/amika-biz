import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import TOML from "@iarna/toml";

export type MailAccountConfig = {
  mbsync_box: string;
  md_box: string;
};

export type BizConfig = {
  mail?: Record<string, MailAccountConfig>;
};

export const DEFAULT_CONFIG_PATH = path.join(
  homedir(),
  ".config",
  "amika-biz",
  "config.toml",
);

export const DEFAULT_STATE_DIR = path.join(
  homedir(),
  ".local",
  "state",
  "amika-biz",
);

function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return path.join(homedir(), p.slice(2));
  return p;
}

export function loadConfig(configPath: string): BizConfig {
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      throw new Error(
        `Config file not found at ${configPath}. Create it or pass --config <path>.`,
      );
    }
    throw err;
  }
  const parsed = TOML.parse(raw) as BizConfig;
  if (parsed.mail) {
    for (const account of Object.values(parsed.mail)) {
      account.mbsync_box = expandHome(account.mbsync_box);
      account.md_box = expandHome(account.md_box);
    }
  }
  return parsed;
}

export function getMailAccount(
  cfg: BizConfig,
  name: string,
): MailAccountConfig {
  const acct = cfg.mail?.[name];
  if (!acct) {
    const known = Object.keys(cfg.mail ?? {}).join(", ") || "(none)";
    throw new Error(`Unknown mail account "${name}". Configured: ${known}`);
  }
  return acct;
}

export function listMailAccounts(cfg: BizConfig): string[] {
  return Object.keys(cfg.mail ?? {});
}
