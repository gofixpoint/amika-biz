---
name: mail
description: "Work with the local mbsync-to-markdown mail corpus. Explains the `biz mail` commands (setup, mbox ls, convert, fd, rg), the per-message markdown frontmatter, and the on-disk folder layout so an agent can search and read mail without re-deriving conventions."
---

# Local mail corpus

This repo's `biz mail` tooling converts mbsync Maildirs into one markdown file per email, mirroring the Maildir folder hierarchy. Use this skill when you need to search, read, or cite emails from the local corpus.

## Config

`~/.config/fixpoint/biz/config.toml` defines one section per mailbox:

```toml
[mail.fixpoint]
mbsync_box = "~/mail/fixpoint"
md_box = "~/mail/fixpoint-md"

[mail.amika]
mbsync_box = "~/mail/amika"
md_box = "~/mail/amika-md"
```

`mbsync_box` is the raw Maildir tree written by mbsync. `md_box` is the converted markdown tree consumed by humans and agents. Agents should read from `md_box`, never from `mbsync_box`.

Override paths with the global `--config <path>` and `--state-dir <path>` flags on `biz`.

## Commands

### `biz mail setup --name <name> --mbsync-box <path> --md-box <path> [--force]`

Add a `[mail.<name>]` entry to the config file (creates the file if missing). Refuses to overwrite an existing entry unless `--force`. `biz mail setup --help` also prints the TOML format.

### `biz mail mbox ls [--format table|json]`

List configured mailboxes and their `mbsync_box` / `md_box` paths. Use this first when you don't know which mailboxes are available.

### `biz mail convert <account> | --all [flags]`

Convert mbsync messages into markdown. Watermarks progress per-account-per-folder by file mtime in `~/.local/state/fixpoint/biz/mail-state.json`, so re-runs only process new mail.

Flags worth knowing:

- `--since <iso-datetime>` — override checkpoint, process anything with mtime newer than this.
- `--until <iso-datetime>` — bounded backfill.
- `--folder <name>` (repeatable) / `--exclude-folder <name>` — restrict folders.
- `--limit <n>` — cap per folder; good for first-run sanity checks.
- `--reprocess` — ignore checkpoint and reprocess everything in range. Overwrites existing markdown files.
- `--no-checkpoint-update` — process without advancing the watermark (pair with `--since` for ad-hoc backfills).
- `--dry-run` — print target paths without writing.
- `--keep-quotes` — keep `>` quoted reply chains verbatim (default collapses them to a one-line placeholder).
- `--max-attachment-size <bytes>` — default 10 MiB; oversized attachments are skipped with a stub link.
- `--concurrency <n>` — parallel message parses (default 4).
- `--verbose` / `--quiet`.

### `biz mail fd [fd args...]`

Forwards arguments to `fd` and appends every configured `md_box` as a search root. Use this to find files by name across all mailboxes, e.g. `biz mail fd -e md 'workos'`.

### `biz mail rg [rg args...]`

Forwards arguments to `rg` and appends every configured `md_box` as a search root. Use this to grep email bodies and frontmatter, e.g. `biz mail rg 'thread_id: 4f2b9a1e'`.

Both passthroughs require `fd` / `rg` to be on `PATH`.

## On-disk layout

Inside each `md_box`:

```
<md_box>/
  INBOX/
    2026-05-19T14-32-alice-re-workos-rollout.md
    2026-05-20T09-08-bob-meeting-recap.md
    _attachments/
      4f2b9a1e8c1d2f30/
        slide-deck.pdf
        diagram.png
  [Gmail]/Sent Mail/
    2026-05-20T10-12-dylan-re-workos-rollout.md
    _attachments/...
  Archive/
    ...
```

- One markdown file per message. Threading is recovered via frontmatter, not by directory grouping.
- Folder names mirror the Maildir hierarchy with mbsync's leading "." and "." separators normalized (e.g. `.[Gmail].Sent Mail` becomes `[Gmail]/Sent Mail`).
- Filenames are `YYYY-MM-DDTHH-MM-<from-slug>-<subject-slug>.md` in UTC. The from-slug is the local-part of the first `From:` address.
- Attachments live under `<folder>/_attachments/<thread_id>/<filename>`. All attachments for a thread cluster together regardless of which message they came from.

## Frontmatter

Every converted message starts with YAML frontmatter. Example:

```markdown
---
from:
  - "Alice Example <alice@example.com>"
to:
  - "Dylan Mikus <dylan@fixpoint.co>"
cc:
  - "Bob <bob@example.com>"
date: "2026-05-19T18:32:14.000Z"
subject: "Re: WorkOS rollout"
message_id: "<CAH+abc123@mail.gmail.com>"
in_reply_to: "<CAH+xyz789@mail.gmail.com>"
references:
  - "<CAH+root000@mail.gmail.com>"
  - "<CAH+xyz789@mail.gmail.com>"
thread_id: "4f2b9a1e8c1d2f30"
folder: "INBOX"
direction: "received"
attachments:
  - "_attachments/4f2b9a1e8c1d2f30/slide-deck.pdf"
---

# Re: WorkOS rollout

(body in markdown)

## Attachments

- [slide-deck.pdf](_attachments/4f2b9a1e8c1d2f30/slide-deck.pdf) (482113 bytes)
```

Field reference:

- `from`, `to`, `cc`, `bcc` — arrays of `"Name <addr@host>"` strings (just `addr@host` when no display name).
- `date` — ISO 8601 UTC, taken from the `Date:` header (falls back to file mtime).
- `subject` — `(no subject)` when missing.
- `message_id`, `in_reply_to` — raw header values with angle brackets.
- `references` — array of parent `Message-ID`s, oldest first.
- `thread_id` — 16-hex-char sha1 prefix of `references[0]` (or own `message_id` if no parent). Stable across all messages in the same thread, so `rg "thread_id: <id>"` groups a thread.
- `folder` — normalized Maildir folder (e.g. `INBOX`, `[Gmail]/Sent Mail`).
- `direction` — `sent` or `received`, derived from folder name (`Sent`, `[Gmail]/Sent Mail`, `Sent Items` match as `sent`).
- `attachments` — paths relative to the message file. Empty / omitted when no attachments survived the size cap.

## Recipes

**Find every message in a thread**, given a `Message-ID` from one message:

1. `biz mail rg -l "message_id: \"<id>\"" ` to locate one file.
2. Read its frontmatter, grab `thread_id`.
3. `biz mail rg -l "thread_id: <thread_id>"` to enumerate the whole thread.

**Find emails to/from a person**: `biz mail rg -l "alice@example.com"`. Hits in `from:` / `to:` / `cc:` blocks indicate participation.

**Find emails in a date range**: `biz mail rg -l "date: \"2026-05"`, optionally piped through `sort` since filenames sort chronologically.

**Sent mail only**: `biz mail rg -l 'direction: sent'`, or `biz mail fd . '[Gmail]/Sent Mail'`.

**Bulk re-export a specific folder** after editing parsing: `biz mail convert <account> --folder INBOX --reprocess --limit 50` to sanity-check before running unbounded.

## Pitfalls

- Don't edit files under `md_box` by hand; `--reprocess` will overwrite them.
- Don't search `mbsync_box` — those are raw RFC 5322 messages, not markdown.
- Quoted replies are collapsed by default. If a reply seems suspiciously short, the prior context lives in the parent message in the same thread (look it up via `thread_id`).
- Attachments over 10 MiB are skipped with a stub line in the markdown; the raw bytes still exist under `mbsync_box` if you need them.
- `thread_id` is derived from `references[0]`. A reply that breaks the `References:` chain (some clients strip it) will start a new `thread_id` even though the human thread continues. Cross-check with `subject` when in doubt.
