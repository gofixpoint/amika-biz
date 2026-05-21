import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export const MBSYNCRC_PATH = path.join(homedir(), ".mbsyncrc");

export type MbsyncBlockArgs = {
  name: string;
  email: string;
  mbsyncBox: string;
  certificatePath: string | null;
};

export function mbsyncrcHasAccount(
  name: string,
  filePath: string = MBSYNCRC_PATH,
): boolean {
  if (!existsSync(filePath)) return false;
  const content = readFileSync(filePath, "utf8");
  const header = `IMAPAccount ${name}`;
  return content.split("\n").some((line) => line.trim() === header);
}

export function renderMbsyncBlock(args: MbsyncBlockArgs): string {
  const { name, email, mbsyncBox, certificatePath } = args;
  const boxPath = mbsyncBox.endsWith("/") ? mbsyncBox : `${mbsyncBox}/`;
  const lines: string[] = [
    `########################`,
    `# ${name}`,
    `########################`,
    ``,
    `IMAPAccount ${name}`,
    `Host imap.gmail.com`,
    `User ${email}`,
    `PassCmd "security find-generic-password -a ${email} -s gmail-mbsync-${name} -w"`,
    `TLSType IMAPS`,
    `AuthMechs LOGIN`,
  ];
  if (certificatePath) {
    lines.push(`CertificateFile ${certificatePath}`);
  }
  lines.push(
    ``,
    `IMAPStore ${name}-remote`,
    `Account ${name}`,
    ``,
    `MaildirStore ${name}-local`,
    `Path ${boxPath}`,
    `Inbox ${boxPath}INBOX/`,
    `SubFolders Verbatim`,
    ``,
    `Channel ${name}`,
    `Far :${name}-remote:`,
    `Near :${name}-local:`,
    `Patterns *`,
    `Create Near`,
    `SyncState *`,
    `Sync All`,
    ``,
  );
  return lines.join("\n");
}

export function appendMbsyncBlock(
  block: string,
  filePath: string = MBSYNCRC_PATH,
): void {
  if (!existsSync(filePath)) {
    writeFileSync(filePath, block);
    return;
  }
  const existing = readFileSync(filePath, "utf8");
  const sep = existing.endsWith("\n") ? "\n" : "\n\n";
  appendFileSync(filePath, `${sep}${block}`);
}
