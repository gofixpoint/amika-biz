import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export const CONFIG_TOML_EXAMPLE = `[mail.<name>]
# path to the mbsync directory
mbsync_box = "~/mail/<name>"
# path to the output of the markdown
md_box = "~/mail/<name>-md"
`;

export type SetupArgs = {
  configPath: string;
  name: string;
  mbsyncBox: string;
  mdBox: string;
  force: boolean;
};

export function setupMailAccount(args: SetupArgs): {
  written: string;
  replaced: boolean;
} {
  const { configPath, name, mbsyncBox, mdBox, force } = args;
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new Error(
      `Invalid account name "${name}". Use letters, digits, "_" or "-".`,
    );
  }

  const section = renderSection(name, mbsyncBox, mdBox);

  if (!existsSync(configPath)) {
    mkdirSync(path.dirname(configPath), { recursive: true });
    writeFileSync(configPath, section);
    return { written: configPath, replaced: false };
  }

  const existing = readFileSync(configPath, "utf8");
  const header = `[mail.${name}]`;
  const hasSection = existing.split("\n").some((l) => l.trim() === header);

  if (hasSection) {
    if (!force) {
      throw new Error(
        `Account "${name}" already exists in ${configPath}. Pass --force to overwrite.`,
      );
    }
    const replaced = replaceSection(existing, header, section);
    writeFileSync(configPath, replaced);
    return { written: configPath, replaced: true };
  }

  const sep = existing.endsWith("\n") ? "\n" : "\n\n";
  appendFileSync(configPath, `${sep}${section}`);
  return { written: configPath, replaced: false };
}

function renderSection(name: string, mbsyncBox: string, mdBox: string): string {
  return [
    `[mail.${name}]`,
    `# path to the mbsync directory`,
    `mbsync_box = "${mbsyncBox}"`,
    `# path to the output of the markdown`,
    `md_box = "${mdBox}"`,
    ``,
  ].join("\n");
}

/**
 * Replace the lines from `header` up to (but not including) the next
 * top-level section header `[...]` with the new section body.
 */
function replaceSection(
  source: string,
  header: string,
  newSection: string,
): string {
  const lines = source.split("\n");
  const startIdx = lines.findIndex((l) => l.trim() === header);
  if (startIdx === -1) return source;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      endIdx = i;
      break;
    }
  }
  const before = lines.slice(0, startIdx).join("\n");
  const after = lines.slice(endIdx).join("\n");
  const beforePart = before.length > 0 ? `${before}\n` : "";
  const afterPart = after.length > 0 ? `\n${after}` : "";
  return `${beforePart}${newSection}${afterPart}`;
}
