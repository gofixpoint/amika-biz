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

## Fixpoint Account

```bash
security add-generic-password \
  -a dylan@fixpoint.co \
  -s gmail-mbsync-fixpoint \
  -w
```

Paste the app password.

---

## Amika Account

```bash
security add-generic-password \
  -a dylan@amika.dev \
  -s gmail-mbsync-amika \
  -w
```

Paste the app password.

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

Add:

```ini
########################
# Fixpoint
########################

IMAPAccount fixpoint
Host imap.gmail.com
User dylan@fixpoint.co
PassCmd "security find-generic-password -a dylan@fixpoint.co -s gmail-mbsync-fixpoint -w"
TLSType IMAPS
AuthMechs LOGIN
CertificateFile /opt/homebrew/etc/openssl@3/cert.pem

IMAPStore fixpoint-remote
Account fixpoint

MaildirStore fixpoint-local
Path ~/mail/fixpoint/
Inbox ~/mail/fixpoint/INBOX/
SubFolders Verbatim

Channel fixpoint
Far :fixpoint-remote:
Near :fixpoint-local:
Patterns *
Create Near
SyncState *
Sync All


########################
# Amika
########################

IMAPAccount amika
Host imap.gmail.com
User dylan@amika.dev
PassCmd "security find-generic-password -a dylan@amika.dev -s gmail-mbsync-amika -w"
TLSType IMAPS
AuthMechs LOGIN
CertificateFile /opt/homebrew/etc/openssl@3/cert.pem

IMAPStore amika-remote
Account amika

MaildirStore amika-local
Path ~/mail/amika/
Inbox ~/mail/amika/INBOX/
SubFolders Verbatim

Channel amika
Far :amika-remote:
Near :amika-local:
Patterns *
Create Near
SyncState *
Sync All
```

Save and exit.

---

# 7. Run Initial Sync

Sync all accounts:

```bash
mbsync -a
```

This creates:

```text
~/mail/fixpoint/
~/mail/amika/
```

Each email becomes a raw `.eml` file in Maildir format.

Example:

```text
~/mail/fixpoint/INBOX/cur/
```

---

# 11. Resulting Directory Structure

```text
~/email-archive/
├── markdown/
│   ├── fixpoint/
│   │   └── 2026/
│   │       └── 05/
│   │           └── email-subject.md
│   └── amika/
└── attachments/
```

Each email becomes a Markdown file like:

```md
---
account: "fixpoint"
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
