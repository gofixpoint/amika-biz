import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { addGenericPassword } from "./keychain.js";
import {
  MBSYNCRC_PATH,
  appendMbsyncBlock,
  mbsyncrcHasAccount,
  renderMbsyncBlock,
} from "./mbsyncrc.js";
import { detectOpensslCertPath, hasMbsync } from "./deps.js";
import { setupMailAccount } from "./setup.js";

const NAME_REGEX = /^[A-Za-z0-9_-]+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GMAIL_INSTRUCTIONS = [
  "Before continuing, make sure this Gmail account is ready:",
  "",
  "  1. Create an App Password (your normal Gmail password will not work):",
  "       https://myaccount.google.com/apppasswords",
  "",
  "When you have the 16-character app password ready, press Enter to continue.",
].join("\n");

export type WizardArgs = {
  configPath: string;
};

export async function runWizard(args: WizardArgs): Promise<void> {
  if (!hasMbsync()) {
    throw new Error(
      "mbsync (isync) is not installed. Install it with:\n  brew install isync",
    );
  }

  console.log("biz mail setup — interactive wizard\n");

  const name = await promptValidated(
    "Account nickname (letters/digits/_/-): ",
    (v) => (NAME_REGEX.test(v) ? true : "Use only letters, digits, '_' or '-'."),
  );

  const mbsyncrcExists = mbsyncrcHasAccount(name);

  let email: string | null = null;
  let password: string | null = null;

  if (mbsyncrcExists) {
    console.log(
      `\n"${name}" is already configured in ${MBSYNCRC_PATH}; skipping mbsync setup.`,
    );
  } else {
    console.log(`\n${GMAIL_INSTRUCTIONS}`);
    await promptLine("");

    email = await promptValidated(
      "\nEmail address for this account: ",
      (v) => (EMAIL_REGEX.test(v) ? true : "Doesn't look like an email address."),
    );
    password = await promptPasswordConfirmed();
  }

  const defaultMbsyncBox = `~/mail/${name}`;
  const defaultMdBox = `~/mail/${name}-md`;

  const mbsyncBox =
    (await promptLine(`mbsync_box path [${defaultMbsyncBox}]: `)).trim() ||
    defaultMbsyncBox;
  const mdBox =
    (await promptLine(`md_box path [${defaultMdBox}]: `)).trim() ||
    defaultMdBox;

  if (!mbsyncrcExists) {
    console.log("\nStoring app password in Keychain…");
    addGenericPassword({
      account: email!,
      service: `gmail-mbsync-${name}`,
      password: password!,
    });

    const certPath = detectOpensslCertPath();
    const block = renderMbsyncBlock({
      name,
      email: email!,
      mbsyncBox: expandHome(mbsyncBox),
      certificatePath: certPath,
    });
    appendMbsyncBlock(block);
    console.log(`Wrote IMAPAccount ${name} block to ${MBSYNCRC_PATH}.`);
  }

  const result = setupMailAccount({
    configPath: args.configPath,
    name,
    mbsyncBox,
    mdBox,
    force: true,
  });
  const verb = result.replaced ? "Updated" : "Added";
  console.log(`${verb} [mail.${name}] in ${result.written}.`);

  if (!mbsyncrcExists) {
    const answer = (
      await promptLine(`\nRun initial sync now (mbsync ${name})? [y/N]: `)
    )
      .trim()
      .toLowerCase();
    if (answer === "y" || answer === "yes") {
      console.log(`\n$ mbsync ${name}`);
      const sp = spawnSync("mbsync", [name], { stdio: "inherit" });
      if (sp.status !== 0) {
        console.error(`mbsync exited with status ${sp.status}.`);
      }
    } else {
      console.log(
        `\nWhen ready, sync with:\n  mbsync ${name}\n\nThen convert to markdown:\n  biz mail convert ${name}`,
      );
    }
  }
}

export type NonInteractiveArgs = {
  configPath: string;
  name: string;
  email: string;
  mbsyncBox: string;
  mdBox: string;
  passwordFile: string;
  force: boolean;
};

export function runNonInteractive(args: NonInteractiveArgs): void {
  if (!NAME_REGEX.test(args.name)) {
    throw new Error(`Invalid --name "${args.name}". Use letters/digits/_/-.`);
  }
  if (!EMAIL_REGEX.test(args.email)) {
    throw new Error(`Invalid --email "${args.email}".`);
  }
  const password = readPasswordFile(args.passwordFile);

  const mbsyncrcExists = mbsyncrcHasAccount(args.name);
  if (mbsyncrcExists) {
    console.log(
      `"${args.name}" is already configured in ${MBSYNCRC_PATH}; skipping mbsync setup.`,
    );
  } else {
    addGenericPassword({
      account: args.email,
      service: `gmail-mbsync-${args.name}`,
      password,
    });
    const certPath = detectOpensslCertPath();
    const block = renderMbsyncBlock({
      name: args.name,
      email: args.email,
      mbsyncBox: expandHome(args.mbsyncBox),
      certificatePath: certPath,
    });
    appendMbsyncBlock(block);
    console.log(`Wrote IMAPAccount ${args.name} block to ${MBSYNCRC_PATH}.`);
  }

  const result = setupMailAccount({
    configPath: args.configPath,
    name: args.name,
    mbsyncBox: args.mbsyncBox,
    mdBox: args.mdBox,
    force: args.force,
  });
  const verb = result.replaced ? "Updated" : "Added";
  console.log(`${verb} [mail.${args.name}] in ${result.written}.`);
}

function readPasswordFile(filePath: string): string {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      throw new Error(`Password file not found: ${filePath}`);
    }
    throw err;
  }
  const trimmed = raw.replace(/\r?\n$/, "");
  if (trimmed.length === 0) {
    throw new Error(`Password file is empty: ${filePath}`);
  }
  return trimmed;
}

function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return path.join(homedir(), p.slice(2));
  return p;
}

async function promptValidated(
  prompt: string,
  validate: (v: string) => true | string,
): Promise<string> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const v = (await promptLine(prompt)).trim();
    const result = validate(v);
    if (result === true) return v;
    console.log(`  ${result}`);
  }
}

async function promptPasswordConfirmed(): Promise<string> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const a = await readLineFromTTY({ prompt: "App password: ", hidden: true });
    if (a.length === 0) {
      console.log("  Password cannot be empty.");
      continue;
    }
    const b = await readLineFromTTY({
      prompt: "Confirm app password: ",
      hidden: true,
    });
    if (a === b) return a;
    console.log("  Passwords did not match. Try again.");
  }
}

function promptLine(prompt: string): Promise<string> {
  return readLineFromTTY({ prompt, hidden: false });
}

type ReadLineOpts = {
  prompt: string;
  hidden: boolean;
};

function readLineFromTTY(opts: ReadLineOpts): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error("Cannot read input: stdin is not a TTY."));
      return;
    }
    process.stdout.write(opts.prompt);

    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let buf = "";

    const cleanup = (): void => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
    };

    const onData = (chunk: string): void => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          process.stdout.write("\n");
          cleanup();
          resolve(buf);
          return;
        }
        if (ch === "\u0003") {
          cleanup();
          process.stdout.write("\n");
          reject(new Error("Aborted."));
          return;
        }
        if (ch === "\u007f" || ch === "\b") {
          if (buf.length > 0) {
            buf = buf.slice(0, -1);
            if (!opts.hidden) {
              process.stdout.write("\b \b");
            }
          }
          continue;
        }
        // Ignore other control characters
        if (ch < " " && ch !== "\t") continue;
        buf += ch;
        if (!opts.hidden) process.stdout.write(ch);
      }
    };

    stdin.on("data", onData);
  });
}
