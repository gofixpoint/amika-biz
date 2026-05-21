import { createHash } from "node:crypto";
import type { AddressObject, ParsedMail } from "mailparser";
import TurndownService from "turndown";

const td = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "_",
});

export function htmlToMarkdown(html: string): string {
  return td.turndown(html).trim();
}

/**
 * Replace blocks of "> " quoted lines with a one-line placeholder. Preserves
 * non-quoted interleaved content. Also strips the "On ... wrote:" preamble
 * that typically precedes a quote block.
 */
export function collapseQuotes(body: string): string {
  const lines = body.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const isQuote = (s: string) => /^\s*>/.test(s);
    if (isQuote(lines[i]!)) {
      let count = 0;
      while (i < lines.length && (isQuote(lines[i]!) || lines[i]!.trim() === "")) {
        if (isQuote(lines[i]!)) count++;
        i++;
      }
      // Strip a trailing "On <date>, <addr> wrote:" line from out if present.
      while (
        out.length > 0 &&
        /^On .+wrote:\s*$/i.test(out[out.length - 1]!.trim())
      ) {
        out.pop();
      }
      while (out.length > 0 && out[out.length - 1]!.trim() === "") out.pop();
      out.push(`> [quoted: ${count} line${count === 1 ? "" : "s"} from prior message]`);
    } else {
      out.push(lines[i]!);
      i++;
    }
  }
  return out.join("\n").trim();
}

export function stripSignature(body: string): string {
  // Standard sig delimiter: a line consisting of "-- " (with trailing space).
  const idx = body.indexOf("\n-- \n");
  if (idx >= 0) return body.slice(0, idx).trimEnd();
  return body;
}

export function addressesToList(
  addr: AddressObject | AddressObject[] | undefined,
): string[] {
  if (!addr) return [];
  const arr = Array.isArray(addr) ? addr : [addr];
  const out: string[] = [];
  for (const a of arr) {
    for (const v of a.value ?? []) {
      if (v.address) {
        out.push(v.name ? `${v.name} <${v.address}>` : v.address);
      }
    }
  }
  return out;
}

export function deriveThreadId(parsed: ParsedMail): string {
  const refs = normalizeRefs(parsed.references);
  const root = refs[0] ?? parsed.messageId ?? parsed.subject ?? "unknown";
  return shortHash(root);
}

export function normalizeRefs(
  refs: string | string[] | undefined,
): string[] {
  if (!refs) return [];
  if (Array.isArray(refs)) return refs;
  return refs.split(/\s+/).filter(Boolean);
}

function shortHash(s: string): string {
  return createHash("sha1").update(s).digest("hex").slice(0, 16);
}

export function slugify(s: string, maxLen = 60): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, maxLen) || "untitled"
  );
}

export function fromAddressForSlug(
  from: AddressObject | AddressObject[] | undefined,
): string {
  const list = addressesToList(from);
  if (list.length === 0) return "unknown";
  const first = list[0]!;
  const m = first.match(/<([^>]+)>/);
  const addr = m ? m[1]! : first;
  return addr.split("@")[0] ?? "unknown";
}

export function formatDateForFilename(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}`;
}

export function yamlEscape(value: string): string {
  if (value === "") return '""';
  if (/[:#\-?&*!|>'"%@`{}\[\],\n]/.test(value) || /^\s|\s$/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

export function buildFrontmatter(fields: Record<string, unknown>): string {
  const lines: string[] = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${yamlEscape(String(item))}`);
    } else {
      lines.push(`${key}: ${yamlEscape(String(value))}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}
