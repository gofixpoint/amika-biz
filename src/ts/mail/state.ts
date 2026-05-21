import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type FolderState = {
  /** Most recent processed mtime, ISO 8601. */
  last_mtime: string;
  /** Count of messages processed (cumulative). */
  processed: number;
};

export type AccountState = {
  folders: Record<string, FolderState>;
};

export type MailState = {
  accounts: Record<string, AccountState>;
};

function stateFilePath(stateDir: string): string {
  return path.join(stateDir, "mail-state.json");
}

export function loadState(stateDir: string): MailState {
  const file = stateFilePath(stateDir);
  try {
    const raw = readFileSync(file, "utf8");
    return JSON.parse(raw) as MailState;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return { accounts: {} };
    throw err;
  }
}

export function saveState(stateDir: string, state: MailState): void {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(stateFilePath(stateDir), JSON.stringify(state, null, 2));
}

export function getFolderState(
  state: MailState,
  account: string,
  folder: string,
): FolderState | undefined {
  return state.accounts[account]?.folders[folder];
}

export function setFolderState(
  state: MailState,
  account: string,
  folder: string,
  next: FolderState,
): void {
  if (!state.accounts[account]) state.accounts[account] = { folders: {} };
  state.accounts[account].folders[folder] = next;
}
