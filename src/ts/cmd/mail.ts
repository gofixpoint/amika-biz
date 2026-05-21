import { spawnSync } from "node:child_process";
import { Command } from "commander";
import { getGlobalOpts } from "./main.js";
import { loadConfig, listMailAccounts } from "../mail/config.js";
import { hasMbsync } from "../mail/deps.js";
import { CONFIG_TOML_EXAMPLE } from "../mail/setup.js";

export function registerMailCommand(program: Command): void {
  const mail = program.command("mail").description("Mail tooling");

  const setup = mail
    .command("setup")
    .description(
      "Add a mail account: interactive wizard, or pass --no-interactive with flags",
    )
    .option("--name <name>", "account name, e.g. fixpoint")
    .option("--email <addr>", "Gmail address for this account")
    .option("--mbsync-box <path>", "path to the mbsync Maildir root")
    .option("--md-box <path>", "path to the markdown output directory")
    .option(
      "--password-file <path>",
      "file containing the Gmail app password (required with --no-interactive)",
    )
    .option(
      "--no-interactive",
      "run non-interactively; requires --name/--email/--mbsync-box/--md-box/--password-file",
    )
    .option("--force", "overwrite the config.toml section if it already exists", false)
    .action(
      async (opts: {
        name?: string;
        email?: string;
        mbsyncBox?: string;
        mdBox?: string;
        passwordFile?: string;
        interactive: boolean;
        force: boolean;
      }) => {
        if (process.platform !== "darwin") {
          console.error("biz mail setup is supported on macOS only.");
          process.exit(1);
        }
        const globalOpts = getGlobalOpts();
        try {
          if (opts.interactive === false) {
            const missing: string[] = [];
            if (!opts.name) missing.push("--name");
            if (!opts.email) missing.push("--email");
            if (!opts.mbsyncBox) missing.push("--mbsync-box");
            if (!opts.mdBox) missing.push("--md-box");
            if (!opts.passwordFile) missing.push("--password-file");
            if (missing.length > 0) {
              console.error(
                `--no-interactive requires: ${missing.join(", ")}`,
              );
              process.exit(1);
            }
            const { runNonInteractive } = await import("../mail/wizard.js");
            runNonInteractive({
              configPath: globalOpts.config,
              name: opts.name!,
              email: opts.email!,
              mbsyncBox: opts.mbsyncBox!,
              mdBox: opts.mdBox!,
              passwordFile: opts.passwordFile!,
              force: opts.force,
            });
            return;
          }
          const { runWizard } = await import("../mail/wizard.js");
          await runWizard({ configPath: globalOpts.config });
        } catch (err) {
          console.error((err as Error).message);
          process.exit(1);
        }
      },
    );

  setup.addHelpText(
    "after",
    `\nConfig file format (~/.config/amika-biz/config.toml):\n\n${indent(CONFIG_TOML_EXAMPLE, "  ")}\nMultiple [mail.<name>] sections can be added; each \`biz mail setup\` invocation appends or replaces one.`,
  );

  const mbox = mail.command("mbox").description("Manage configured mailboxes");

  mbox
    .command("ls")
    .description("List configured mailboxes with their mbsync and md dirs")
    .option(
      "--format <fmt>",
      "output format: table or json",
      "table",
    )
    .action((opts: { format: string }) => {
      const globalOpts = getGlobalOpts();
      const cfg = loadConfig(globalOpts.config);
      const accounts = listMailAccounts(cfg);
      const rows = accounts.map((name) => ({
        name,
        mbsync_box: cfg.mail![name]!.mbsync_box,
        md_box: cfg.mail![name]!.md_box,
      }));
      if (opts.format === "json") {
        console.log(JSON.stringify(rows, null, 2));
        return;
      }
      if (opts.format !== "table") {
        console.error(`Unknown --format "${opts.format}". Use table or json.`);
        process.exit(1);
      }
      if (rows.length === 0) {
        console.log("(no mailboxes configured)");
        return;
      }
      const headers = ["NAME", "MBSYNC_BOX", "MD_BOX"];
      const widths = [
        Math.max(headers[0]!.length, ...rows.map((r) => r.name.length)),
        Math.max(headers[1]!.length, ...rows.map((r) => r.mbsync_box.length)),
        Math.max(headers[2]!.length, ...rows.map((r) => r.md_box.length)),
      ];
      const fmt = (cols: string[]) =>
        cols.map((c, i) => c.padEnd(widths[i]!)).join("  ");
      console.log(fmt(headers));
      for (const r of rows) console.log(fmt([r.name, r.mbsync_box, r.md_box]));
    });

  mail
    .command("convert")
    .description(
      "Convert mbsync Maildir to markdown for one account, or --all accounts",
    )
    .argument("[account]", "account name from config.toml ([mail.<account>])")
    .option("--all", "process all configured accounts", false)
    .option(
      "--format <fmt>",
      "output format (only 'md' supported for now)",
      "md",
    )
    .option(
      "--since <datetime>",
      "process messages with mtime >= this ISO datetime (overrides checkpoint)",
    )
    .option(
      "--until <datetime>",
      "process messages with mtime < this ISO datetime",
    )
    .option(
      "--folder <name>",
      "restrict to folder (repeatable)",
      collect,
      [] as string[],
    )
    .option(
      "--exclude-folder <name>",
      "skip folder (repeatable)",
      collect,
      [] as string[],
    )
    .option("--dry-run", "list what would be written without writing", false)
    .option("--reprocess", "ignore checkpoint and reprocess all matching", false)
    .option(
      "--no-checkpoint-update",
      "process but do not advance the checkpoint",
    )
    .option("--limit <n>", "cap messages processed per folder", parseIntArg)
    .option("--concurrency <n>", "parallel message parses", parseIntArg, 4)
    .option(
      "--max-attachment-size <bytes>",
      "skip attachments larger than this size",
      parseIntArg,
      10 * 1024 * 1024,
    )
    .option("--keep-quotes", "keep quoted reply chains verbatim", false)
    .option("--verbose", "verbose logging", false)
    .option("--quiet", "suppress per-message logging", false)
    .action(async (account: string | undefined, opts: ConvertOpts) => {
      if (opts.format !== "md") {
        console.error(`Unsupported --format "${opts.format}". Only 'md' is supported.`);
        process.exit(1);
      }
      const globalOpts = getGlobalOpts();
      const cfg = loadConfig(globalOpts.config);
      const accounts = resolveAccounts(cfg, account, opts.all);
      const { runConvert } = await import("../mail/convert.js");
      for (const name of accounts) {
        await runConvert({
          accountName: name,
          accountCfg: cfg.mail![name]!,
          stateDir: globalOpts.stateDir,
          opts,
        });
      }
    });

  mail
    .command("sync")
    .description(
      "Run mbsync for the given account, or all configured accounts when omitted",
    )
    .argument("[account]", "account name from config.toml ([mail.<account>])")
    .action((account: string | undefined) => {
      if (!hasMbsync()) {
        console.error(
          "mbsync (isync) is not installed. Install it with:\n  brew install isync",
        );
        process.exit(1);
      }
      const globalOpts = getGlobalOpts();
      const cfg = loadConfig(globalOpts.config);
      const accounts = resolveAccounts(cfg, account, account === undefined);
      for (const name of accounts) {
        console.log(`$ mbsync ${name}`);
        const sp = spawnSync("mbsync", [name], { stdio: "inherit" });
        if (sp.status !== 0) {
          console.error(`mbsync ${name} exited with status ${sp.status}.`);
          process.exit(sp.status ?? 1);
        }
      }
    });

  mail
    .command("fd")
    .description("Run `fd` against the converted markdown boxes")
    .argument("[args...]", "arguments forwarded to fd")
    .allowUnknownOption(true)
    .action(async (args: string[]) => {
      const { runPassthrough } = await import("../mail/passthrough.js");
      await runPassthrough("fd", args);
    });

  mail
    .command("rg")
    .description("Run `rg` against the converted markdown boxes")
    .argument("[args...]", "arguments forwarded to rg")
    .allowUnknownOption(true)
    .action(async (args: string[]) => {
      const { runPassthrough } = await import("../mail/passthrough.js");
      await runPassthrough("rg", args);
    });
}

export type ConvertOpts = {
  all: boolean;
  format: string;
  since?: string;
  until?: string;
  folder: string[];
  excludeFolder: string[];
  dryRun: boolean;
  reprocess: boolean;
  checkpointUpdate: boolean;
  limit?: number;
  concurrency: number;
  maxAttachmentSize: number;
  keepQuotes: boolean;
  verbose: boolean;
  quiet: boolean;
};

function resolveAccounts(
  cfg: ReturnType<typeof loadConfig>,
  account: string | undefined,
  all: boolean,
): string[] {
  const available = listMailAccounts(cfg);
  if (available.length === 0) {
    console.error("No [mail.<account>] entries found in config.");
    process.exit(1);
  }
  if (all) return available;
  if (!account) {
    console.error(
      `Specify an account or --all. Available: ${available.join(", ")}`,
    );
    process.exit(1);
  }
  if (!available.includes(account)) {
    console.error(
      `Unknown account "${account}". Available: ${available.join(", ")}`,
    );
    process.exit(1);
  }
  return [account];
}

function collect(value: string, prev: string[]): string[] {
  return [...prev, value];
}

function indent(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((l) => (l.length > 0 ? `${prefix}${l}` : l))
    .join("\n");
}

function parseIntArg(value: string): number {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) throw new Error(`Expected integer, got "${value}"`);
  return n;
}
