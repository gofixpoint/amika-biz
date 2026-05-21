import { readdirSync, statSync } from "node:fs";
import path from "node:path";

export type MaildirMessage = {
  /** Path under the account's mbsync root, e.g. "INBOX" or "[Gmail]/Sent Mail". */
  folder: string;
  /** Absolute path to the message file. */
  filePath: string;
  /** mbsync filename (used as fallback unique key). */
  fileName: string;
  /** File mtime in milliseconds. */
  mtimeMs: number;
};

/**
 * A Maildir folder is a directory containing cur/, new/, tmp/ subdirectories.
 * mbsync stores folders as nested directories with a leading "." for separators
 * (e.g. ".INBOX", ".[Gmail].Sent Mail"). Some setups use plain nested dirs.
 * We detect any directory that has cur/+new/ children as a Maildir folder.
 */
export function findMaildirFolders(root: string): { folder: string; dir: string }[] {
  const found: { folder: string; dir: string }[] = [];
  walk(root, root, found);
  return found.sort((a, b) => a.folder.localeCompare(b.folder));
}

function walk(
  root: string,
  dir: string,
  out: { folder: string; dir: string }[],
): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  const set = new Set(entries);
  if (set.has("cur") && set.has("new")) {
    const rel = path.relative(root, dir);
    const folder = rel === "" ? "INBOX" : normalizeFolderName(rel);
    out.push({ folder, dir });
  }
  for (const name of entries) {
    if (name === "cur" || name === "new" || name === "tmp") continue;
    const full = path.join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(root, full, out);
  }
}

/**
 * mbsync-style folder names use a leading "." and "." as separator within
 * subfolders. Normalize ".INBOX" to "INBOX" and ".[Gmail].Sent Mail" to
 * "[Gmail]/Sent Mail" for display and output paths.
 */
function normalizeFolderName(rel: string): string {
  const parts = rel.split(path.sep).map((p) => (p.startsWith(".") ? p.slice(1) : p));
  return parts.join("/").replaceAll(".", "/");
}

export function listMessages(folderDir: string, folderName: string): MaildirMessage[] {
  const messages: MaildirMessage[] = [];
  for (const sub of ["cur", "new"]) {
    const subDir = path.join(folderDir, sub);
    let entries: string[];
    try {
      entries = readdirSync(subDir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const full = path.join(subDir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      messages.push({
        folder: folderName,
        filePath: full,
        fileName: name,
        mtimeMs: st.mtimeMs,
      });
    }
  }
  return messages;
}

const SENT_FOLDER_PATTERNS: RegExp[] = [
  /(^|\/)sent(\s|$|\/)/i,
  /\[Gmail\]\/Sent Mail/i,
  /Sent Items/i,
];

export function isSentFolder(folder: string): boolean {
  return SENT_FOLDER_PATTERNS.some((re) => re.test(folder));
}
