# amika-biz

A CLI to do business grunt work for you. Right now, this syncs GMail to
Markdown. macOS only right now.

Made with love by [Amika](https://www.amika.dev/).

## Quickstart

1. Install the prerequisites (macOS + [Homebrew](https://brew.sh)):

   ```bash
   brew install isync node fd ripgrep
   ```

2. Grab a Gmail [App Password](https://myaccount.google.com/apppasswords).
   Your normal Gmail password won't work.

3. Run the setup wizard. It prompts for a nickname, your email, and the
   app password (hidden input), then wires up `~/.mbsyncrc`, the macOS
   Keychain, and `~/.config/amika-biz/config.toml` for you:

   ```bash
   ./bin/biz mail setup
   ```

   Re-run it for each additional Gmail account.

4. Pull mail down and convert it to markdown:

   ```bash
   ./bin/biz mail sync             # mbsync every configured account
   ./bin/biz mail convert --all    # turn .eml into one .md per message
   ```

5. Search across every mailbox:

   ```bash
   biz mail rg 'workos rollout'             # full-text grep
   biz mail rg -l 'thread_id: 4f2b9a1e'     # list files in a thread
   biz mail fd -e md 'invoice'              # find files by name
   ```

6. Let an agent search your mail too. The `mail` skill in
   `.agents/skills/mail/SKILL.md` is auto-loaded by Claude Code from this
   repo — open Claude Code in this directory and ask things like
   *"find every email from alice@example.com about workos"* or *"summarise
   the thread starting with this message"*. The skill teaches the agent
   the on-disk layout and frontmatter so it can use `biz mail rg` / `fd`
   itself.

The rest of this README explains how the pieces fit together and the
flags worth knowing for backfills and unattended use.

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
  Credentials are stored in your macOS Keychain.
- **`biz mail convert`** parses your emails into markdown files with YAML
  frontmatter (from/to/date/thread_id/etc.) and extracts attachments.
- **`biz mail fd` / `biz mail rg`** use `fd` and `ripgrep` to search through
  the markdown emails.

Per-mailbox config lives in `~/.config/amika-biz/config.toml`:

```toml
[mail.<name>]
mbsync_box = "~/mail/<name>"
md_box     = "~/mail/<name>-md"
```

## Scripted setup

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
