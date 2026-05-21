# Gmail → Markdown Archive Setup (macOS)

This guide walks through setting up a fully local email archive pipeline on macOS:

```text
Gmail
  ↓
mbsync
  ↓
Maildir
  ↓
TypeScript converter
  ↓
Markdown files
```

At the end, you’ll have:

* a local copy of all Gmail email
* Markdown versions of every message
* attachment extraction
* a filesystem-friendly archive for AI/RAG, Obsidian, or backups

---

# 1. Install Homebrew

If you don’t already have Homebrew:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Verify:

```bash
brew --version
```

---

# 2. Install Dependencies

Install:

* `mbsync` for IMAP syncing
* Node.js for the TypeScript converter

```bash
brew install isync node
```

Optional but recommended:

```bash
brew install openssl
```

---

# 3. Enable Gmail IMAP

For each Gmail account:

1. Open Gmail
2. Go to:

   ```text
   Settings → Forwarding and POP/IMAP
   ```
3. Enable:

   ```text
   IMAP Access
   ```

Save changes.

---

# 4. Create Google App Passwords

Do NOT use your normal Gmail password.

For each account:

1. Open:

   ```text
   https://myaccount.google.com/apppasswords
   ```

2. Create a new App Password:

   * App: `Mail`
   * Device: `Mac`

3. Save the generated password.

You’ll create one password per Gmail account.

---

# 5. Store Passwords in macOS Keychain

For each Gmail account, store its app password in the Keychain. Pick a short
nickname for the account (e.g. `work`, `personal`) — you'll reuse it in the
`mbsync` config below.

```bash
security add-generic-password \
  -a <your-email@example.com> \
  -s gmail-mbsync-<account-nickname> \
  -w
```

Paste the app password when prompted. Repeat for each Gmail account you want to
sync.

---

# 6. Create the `mbsync` Config

Create:

```bash
touch ~/.mbsyncrc
```

Open it:

```bash
nano ~/.mbsyncrc
```

Add one block per Gmail account, substituting `<account-nickname>` and
`<your-email@example.com>` to match the values you used in step 5:

```ini
########################
# <account-nickname>
########################

IMAPAccount <account-nickname>
Host imap.gmail.com
User <your-email@example.com>
PassCmd "security find-generic-password -a <your-email@example.com> -s gmail-mbsync-<account-nickname> -w"
TLSType IMAPS
AuthMechs LOGIN
CertificateFile /opt/homebrew/etc/openssl@3/cert.pem

IMAPStore <account-nickname>-remote
Account <account-nickname>

MaildirStore <account-nickname>-local
Path ~/mail/<account-nickname>/
Inbox ~/mail/<account-nickname>/INBOX/
SubFolders Verbatim

Channel <account-nickname>
Far :<account-nickname>-remote:
Near :<account-nickname>-local:
Patterns *
Create Near
SyncState *
Sync All
```

Duplicate the block for additional accounts, changing the nickname and email
each time. Save and exit.

---

# 7. Run Initial Sync

Sync all accounts:

```bash
mbsync -a
```

This creates one Maildir tree per account:

```text
~/mail/<account-nickname>/
```

Each email becomes a raw `.eml` file in Maildir format, e.g.:

```text
~/mail/<account-nickname>/INBOX/cur/
```

---

# 11. Resulting Directory Structure

```text
~/email-archive/
├── markdown/
│   └── <account-nickname>/
│       └── 2026/
│           └── 05/
│               └── email-subject.md
└── attachments/
```

Each email becomes a Markdown file like:

```md
---
account: "<account-nickname>"
subject: "Weekly Update"
from:
  - "someone@example.com"
date: "2026-05-20T12:00:00.000Z"
attachments:
  - "invoice.pdf"
---

# Weekly Update

Email body here...
```

---

# 12. Re-Sync Later

Whenever you want new mail:

```bash
mbsync -a
```

Then rerun the converter.

---

# 13. Optional Automation

## Auto-sync every 15 minutes

Edit cron:

```bash
crontab -e
```

Add:

```cron
*/15 * * * * /opt/homebrew/bin/mbsync -a
```
