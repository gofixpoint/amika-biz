import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { simpleParser, type ParsedMail } from "mailparser";
import type { MailAccountConfig } from "./config.js";
import type { ConvertOpts } from "../cmd/mail.js";
import {
  findMaildirFolders,
  isSentFolder,
  listMessages,
  type MaildirMessage,
} from "./maildir.js";
import {
  addressesToList,
  buildFrontmatter,
  collapseQuotes,
  deriveThreadId,
  formatDateForFilename,
  fromAddressForSlug,
  htmlToMarkdown,
  normalizeRefs,
  slugify,
  stripSignature,
} from "./render.js";
import {
  getFolderState,
  loadState,
  saveState,
  setFolderState,
} from "./state.js";

export type RunConvertArgs = {
  accountName: string;
  accountCfg: MailAccountConfig;
  stateDir: string;
  opts: ConvertOpts;
};

export async function runConvert(args: RunConvertArgs): Promise<void> {
  const { accountName, accountCfg, stateDir, opts } = args;
  const state = loadState(stateDir);
  const folders = findMaildirFolders(accountCfg.mbsync_box);

  if (folders.length === 0) {
    console.error(
      `[${accountName}] no Maildir folders found under ${accountCfg.mbsync_box}`,
    );
    return;
  }

  const sinceMs = opts.since ? new Date(opts.since).getTime() : undefined;
  const untilMs = opts.until ? new Date(opts.until).getTime() : undefined;

  for (const { folder, dir } of folders) {
    if (opts.folder.length > 0 && !opts.folder.includes(folder)) continue;
    if (opts.excludeFolder.includes(folder)) continue;

    const folderState = getFolderState(state, accountName, folder);
    const checkpointMs =
      opts.reprocess || sinceMs !== undefined
        ? sinceMs
        : folderState
          ? new Date(folderState.last_mtime).getTime()
          : undefined;

    const all = listMessages(dir, folder);
    let candidates = all;
    if (checkpointMs !== undefined) {
      candidates = candidates.filter((m) => m.mtimeMs > checkpointMs);
    }
    if (untilMs !== undefined) {
      candidates = candidates.filter((m) => m.mtimeMs < untilMs);
    }
    candidates.sort((a, b) => a.mtimeMs - b.mtimeMs);
    if (opts.limit !== undefined) candidates = candidates.slice(0, opts.limit);

    if (candidates.length === 0) {
      if (opts.verbose) {
        console.log(`[${accountName}/${folder}] up to date`);
      }
      continue;
    }

    if (!opts.quiet) {
      console.log(
        `[${accountName}/${folder}] processing ${candidates.length} message(s)`,
      );
    }

    let processed = 0;
    let maxMtime = checkpointMs ?? 0;
    const direction = isSentFolder(folder) ? "sent" : "received";

    const concurrency = Math.max(1, opts.concurrency);
    let cursor = 0;
    async function worker(): Promise<void> {
      while (cursor < candidates.length) {
        const idx = cursor++;
        const msg = candidates[idx]!;
        try {
          await processMessage({
            msg,
            accountCfg,
            opts,
            folder,
            direction,
          });
          processed++;
          if (msg.mtimeMs > maxMtime) maxMtime = msg.mtimeMs;
          if (opts.verbose) {
            console.log(`  + ${path.basename(msg.filePath)}`);
          }
        } catch (err) {
          console.error(
            `  ! failed to process ${msg.filePath}: ${(err as Error).message}`,
          );
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    if (!opts.dryRun && opts.checkpointUpdate && processed > 0) {
      const prev = getFolderState(state, accountName, folder);
      setFolderState(state, accountName, folder, {
        last_mtime: new Date(maxMtime).toISOString(),
        processed: (prev?.processed ?? 0) + processed,
      });
      saveState(stateDir, state);
    }
  }
}

type ProcessArgs = {
  msg: MaildirMessage;
  accountCfg: MailAccountConfig;
  opts: ConvertOpts;
  folder: string;
  direction: "sent" | "received";
};

async function processMessage(args: ProcessArgs): Promise<void> {
  const { msg, accountCfg, opts, folder, direction } = args;
  const raw = readFileSync(msg.filePath);
  const parsed = await simpleParser(raw);

  const thread_id = deriveThreadId(parsed);
  const folderOutDir = path.join(accountCfg.md_box, folder);
  const attachmentsDir = path.join(folderOutDir, "_attachments", thread_id);

  const attachmentLinks: string[] = [];
  const attachmentsSaved: { name: string; size: number; path: string }[] = [];

  if (parsed.attachments && parsed.attachments.length > 0) {
    for (const att of parsed.attachments) {
      const name = sanitizeFilename(att.filename ?? `attachment-${att.checksum ?? "x"}`);
      const size = att.size ?? att.content.length;
      if (size > opts.maxAttachmentSize) {
        attachmentLinks.push(
          `- ${name} (skipped: ${size} bytes > max ${opts.maxAttachmentSize})`,
        );
        continue;
      }
      const targetPath = path.join(attachmentsDir, name);
      if (!opts.dryRun) {
        mkdirSync(attachmentsDir, { recursive: true });
        writeFileSync(targetPath, att.content);
      }
      const rel = path.relative(folderOutDir, targetPath);
      attachmentLinks.push(`- [${name}](${rel}) (${size} bytes)`);
      attachmentsSaved.push({ name, size, path: rel });
    }
  }

  const body = renderBody(parsed, opts.keepQuotes);

  const date = parsed.date ?? new Date(msg.mtimeMs);
  const subject = parsed.subject ?? "(no subject)";
  const fromSlug = fromAddressForSlug(parsed.from);

  const frontmatter = buildFrontmatter({
    from: addressesToList(parsed.from),
    to: addressesToList(parsed.to),
    cc: addressesToList(parsed.cc),
    bcc: addressesToList(parsed.bcc),
    date: date.toISOString(),
    subject,
    message_id: parsed.messageId,
    in_reply_to: parsed.inReplyTo,
    references: normalizeRefs(parsed.references),
    thread_id,
    folder,
    direction,
    attachments: attachmentsSaved.map((a) => a.path),
  });

  const filename = `${formatDateForFilename(date)}-${fromSlug}-${slugify(subject)}.md`;
  const outPath = path.join(folderOutDir, filename);

  if (opts.dryRun) {
    console.log(`  ~ would write ${outPath}`);
    return;
  }

  mkdirSync(folderOutDir, { recursive: true });
  const attachmentsBlock =
    attachmentLinks.length > 0
      ? `\n\n## Attachments\n\n${attachmentLinks.join("\n")}\n`
      : "";
  const content = `${frontmatter}\n\n# ${subject}\n\n${body}${attachmentsBlock}\n`;
  writeFileSync(outPath, content);
}

function renderBody(parsed: ParsedMail, keepQuotes: boolean): string {
  let body: string;
  if (parsed.html) {
    body = htmlToMarkdown(parsed.html);
  } else if (parsed.text) {
    body = parsed.text;
  } else {
    body = "";
  }
  body = stripSignature(body);
  if (!keepQuotes) body = collapseQuotes(body);
  return body.trim();
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:]/g, "_").slice(0, 200) || "attachment";
}
