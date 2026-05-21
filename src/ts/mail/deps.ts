import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const OPENSSL_CERT_PATH = "/opt/homebrew/etc/openssl@3/cert.pem";

export function hasMbsync(): boolean {
  const result = spawnSync("which", ["mbsync"], { stdio: "ignore" });
  return result.status === 0;
}

export function detectOpensslCertPath(): string | null {
  return existsSync(OPENSSL_CERT_PATH) ? OPENSSL_CERT_PATH : null;
}
