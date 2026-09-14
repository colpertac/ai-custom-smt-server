# Backup, restore, upgrade, and rollback

Scripts: [`deploy/scripts/backup.sh`](../deploy/scripts/backup.sh),
[`deploy/scripts/restore.sh`](../deploy/scripts/restore.sh),
[`deploy/scripts/backup-sync.sh`](../deploy/scripts/backup-sync.sh).

Cold backup = brief downtime (COMP stopped; MariaDB stopped if present) so SQLite
files and the MariaDB datadir are consistent.

**Preferred path:** Admin → **Backups** (ops sidecar runs the same scripts). That
UI can schedule backups and sync archives off-box with rclone so a destroyed VM
is still recoverable.

---

## What is included

| Path | `standard` (default) | `full` |
| --- | --- | --- |
| `data/config/` | yes (skips `.runtime-*.xml`) | yes |
| `data/database/` | yes (SQLite) | yes |
| `data/mariadb/` | if lobby is `MARIADB` | same |
| `website-data/` (`web.sqlite`, `comp-reset-secret`, `server-content/`) | yes | yes |
| `data/datastore/` / `webroot/` | no | yes |
| `data/logs/` | only `--include-logs` | only `--include-logs` |
| compose `.env` | yes (as `env` in the archive) | yes |

Archive name: `backups/smt-runtime-YYYYMMDD-HHMMSS.tar.gz` (+ `.sha256`).

Portrait caches under `website-data` are skipped (regenerable).

---

## Backup (CLI)

On the compose host (typical VPS install under `/opt/smt`):

```bash
cd /opt/smt   # or your install prefix
./scripts/backup.sh --data ./data --compose . --mode standard
./scripts/backup.sh --mode full    # also datastore / BinaryData / webroot
```

Useful flags: `--out DIR`, `--website-data DIR`, `--include-logs`,
`--skip-website`.

Stack is stopped, archived, then started again automatically.

### Off-box sync (rclone)

```bash
# Once: create a remote (Google Drive, B2, S3, …)
rclone config --config ./backups/rclone.conf

./scripts/backup-sync.sh \
  --out ./backups \
  --remote gdrive \
  --path smt-backups \
  --rclone-config ./backups/rclone.conf \
  --keep-local 7 \
  --keep-remote 14
```

Or configure the same remote/path/schedule in **Admin → Backups** (ops stores
`backups/rclone.conf` + `backups/schedule.json`).

---

## Restore

```bash
cd /opt/smt
./scripts/restore.sh \
  --archive ./backups/smt-runtime-YYYYMMDD-HHMMSS.tar.gz \
  --data ./data --compose . --yes
# optional: --restore-env
```

- Current `data/` (and `website-data/` if present in the archive) are renamed to
  `*.bak-YYYYMMDD-HHMMSS`.
- `website-data` is `chown`'d to uid **1001** after restore (Docker only; native keeps host ownership).
- If restored configs use MariaDB, the script starts with `--profile mariadb`.
- With `OPS_BACKEND=native`, restore uses `comp_hack` stop/start scripts instead of `docker compose`.

Verify:

```bash
docker compose ps
docker compose logs --tail=30 lobby world channel website
```

### New VM (disaster)

1. New VPS: run `install.sh --ip …` (and `--domain` if you use HTTPS).
2. Pull an archive: `rclone copy gdrive:smt-backups ./backups` **or** Admin →
   Import archive.
3. `./scripts/restore.sh --archive … --yes --restore-env`
4. `docker compose up -d` (add `--profile https` / `mariadb` if used).
5. Smoke: website, updater hashlist, lobby/channel TCP, one account login.

Local `./backups` on a dead VM are gone — only an off-box rclone copy (or a
downloaded zip you kept) recovers player DBs.

---

## SQLite vs MariaDB

Same commands for both. The archive stores whichever backend directories exist.
Do not mix: restoring a MariaDB datadir while `data/config` still says `SQLITE3`
(or the reverse) will fail.

---

## Upgrade (binaries only)

Data stays on the host; only the image changes.

```bash
cd /opt/smt
docker compose pull
docker compose up -d
```

Take a backup before upgrading if you care about rollback of **data**.

---

## Rollback

**Image rollback** (keep current data): pin previous Hub tags in `.env`, then
`docker compose up -d`.

**Data rollback:** `./scripts/restore.sh --archive … --yes` (or Admin → Restore).

---

## Suggested cadence

| When | Action |
| --- | --- |
| Before image upgrade | Backup now (standard or full) |
| Daily on a public VM | Admin schedule + rclone sync |
| After successful restore test | delete old `*.bak-*` and aging archives |

Host crontab is optional; Admin → Backups can schedule inside the ops container.
