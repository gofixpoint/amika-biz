# amika-biz

Local-first business tooling. Today this is a Gmail → Maildir → Markdown
pipeline plus a small CLI (`biz`) that wraps the pieces. macOS only.

## How it works

```
Gmail (IMAP)
  │
  ▼   mbsync  (~/.mbsyncrc, password in Keychain)
~/mail/<account>/         ← raw Maildir, one .eml per message
  │
  ▼   biz mail convert
~/mail/<account>-md/      ← one markdown file per message, mirroring Maildir
```

Pieces:

- **`mbsync`** (from `isync`) pulls IMAP folders into a local Maildir tree.
  Credentials come from the macOS Keychain via a `PassCmd` in `~/.mbsyncrc`,
  so the app password never sits on disk in cleartext.
- **`biz mail convert`** parses each `.eml` into a markdown file with YAML
  frontmatter (from/to/date/thread_id/etc.) and extracts attachments. It
  watermarks progress per account+folder in `~/.local/state/amika-biz/` so
  re-runs only process new messages.
- **`biz mail fd` / `biz mail rg`** are thin passthroughs that prepend every
  configured `md_box` as a search root, so you can search across all
  mailboxes at once.

Per-mailbox config lives in `~/.config/amika-biz/config.toml`:

```toml
[mail.<name>]
mbsync_box = "~/mail/<name>"
md_box     = "~/mail/<name>-md"
```

## Set up mail

Prerequisites:

- macOS
- Homebrew
- `brew install isync node`
- A Gmail [App Password](https://myaccount.google.com/apppasswords) for each
  account you want to sync (your normal password won't work).

Then run the interactive wizard, once per Gmail account:

```bash
./bin/biz mail setup
```

It will:

1. Prompt for a nickname for the account.
2. Print the App Password URL.
3. Prompt for the email address and app password (the password input is
   hidden and never appears in `ps`).
4. Store the password in the Keychain under `gmail-mbsync-<nickname>`.
5. Append an `IMAPAccount <nickname>` block to `~/.mbsyncrc`.
6. Add a `[mail.<nickname>]` section to `~/.config/amika-biz/config.toml`.
7. Offer to run `mbsync <nickname>` immediately.

Re-running the wizard with a nickname that already has an `IMAPAccount`
block in `~/.mbsyncrc` skips the mbsync side and just updates the
`config.toml` section.

### Scripted setup

For unattended use, pass `--no-interactive` along with every required flag:

```bash
./bin/biz mail setup --no-interactive \
  --name work \
  --email me@example.com \
  --mbsync-box ~/mail/work \
  --md-box ~/mail/work-md \
  --password-file ~/.secrets/work-gmail-app-password
```

The app password is only ever read from `--password-file`; there is no
`--password` flag.

## Use mail

### CLI

```bash
biz mail mbox ls                    # list configured mailboxes
biz mail sync                       # mbsync all configured accounts
biz mail sync <account>             # mbsync just one
biz mail convert <account>          # update markdown for one account
biz mail convert --all              # update markdown for every account
biz mail fd <args...>               # `fd` across every md_box
biz mail rg <args...>               # `rg` across every md_box
```

Typical refresh cycle:

```bash
biz mail sync && biz mail convert --all
```

`biz mail convert --help` documents the flags that matter for backfills
and one-off reprocessing (`--since`, `--folder`, `--reprocess`,
`--dry-run`, `--limit`, etc.).

### Agent skill

The `mail` skill at `.agents/skills/mail/SKILL.md` teaches an agent the
on-disk layout, frontmatter fields, and search patterns. Once installed,
the agent can:

- Find every message in a thread by grepping `thread_id`.
- Find correspondence with a person by grepping their address across
  every `md_box`.
- Filter sent vs. received via the `direction:` frontmatter field.

The skill is loaded automatically by Claude Code from the
`.agents/skills/mail/` directory in this repo; no manual install. Agents
should read from each account's `md_box`, never from the raw `mbsync_box`.

## Layout

```
bin/biz                          # entry point (calls into src/ts)
src/ts/cmd/                      # commander wiring
src/ts/mail/                     # setup wizard, mbsync helpers, converter
.agents/skills/mail/SKILL.md     # agent-facing usage guide
~/.config/amika-biz/config.toml  # per-mailbox config (user)
~/.local/state/amika-biz/        # convert checkpoints (user)
~/.mbsyncrc                      # IMAP config (user)
```
