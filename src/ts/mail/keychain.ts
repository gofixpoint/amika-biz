import { spawnSync } from "node:child_process";

export type KeychainEntry = {
  account: string;
  service: string;
  password: string;
};

export function addGenericPassword(entry: KeychainEntry): void {
  const { account, service, password } = entry;
  const result = spawnSync(
    "security",
    [
      "add-generic-password",
      "-a",
      account,
      "-s",
      service,
      "-U",
      "-w",
      password,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.status !== 0) {
    const stderr = result.stderr?.toString().trim() ?? "";
    const detail = stderr.length > 0 ? stderr : `exit ${result.status}`;
    throw new Error(
      `Failed to add Keychain entry for service "${service}": ${detail}`,
    );
  }
}
