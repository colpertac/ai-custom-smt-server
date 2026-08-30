# Backup, restore, upgrade, and rollback

Portable runtime root: `comp_hack/runtime/` or `~/docker/smt/data/`.
Scripts: [`deploy/scripts/backup.sh`](../deploy/scripts/backup.sh),
[`deploy/scripts/restore.sh`](../deploy/scripts/restore.sh).

Cold backup = brief downtime (COMP stopped; MariaDB stopped if present) so SQLite
files and the MariaDB datadir are consistent.

---

## What is included

| Path | Backed up |
| --- | --- |
| `data/config/` | yes (skips `.runtime-*.xml`; regenerated on start) |
| `data/database/` | yes (SQLite) |
| `data/mariadb/` | if lobby config is `MARIADB`, or `--include-mariadb` |
| `data/datastore/` | yes |
| `data/webroot/` | yes |
| `data/logs/` | only with `--include-logs` |
| compose `.env` | yes (as `env` inside the archive) |

Archive name: `backups/smt-runtime-YYYYMMDD-HHMMSS.tar.gz` (+ `.sha256`).

MariaDB files are usually root-owned on the host; the scripts copy them through a
short-lived `alpine` container so backup/restore work without `sudo`.

---

## Backup

From the homelab folder (or pass paths explicitly):

```bash
cd ~/docker/smt
/home/cat/repos/smt/ai_custom_smt_server/deploy/scripts/backup.sh \
  --data ./data --compose .
```

Or from `deploy/` after seeding `./data`:

```bash
cd /home/cat/repos/smt/ai_custom_smt_server/deploy
./scripts/backup.sh --data ./data --compose .
```

Useful flags:

```bash
./scripts/backup.sh --include-logs
./scripts/backup.sh --out /mnt/backups/smt
```

Stack is stopped, archived, then started again automatically.

---

## Restore

```bash
cd ~/docker/smt
/home/cat/repos/smt/ai_custom_smt_server/deploy/scripts/restore.sh \
  --archive ./backups/smt-runtime-YYYYMMDD-HHMMSS.tar.gz \
  --data ./data --compose . --yes
```

- Current `data/` is renamed to `data.bak-YYYYMMDD-HHMMSS`.
- Add `--restore-env` to overwrite `.env` from the archive.
- If restored configs use MariaDB, the script starts with `--profile mariadb`.

Verify:

```bash
docker compose ps
docker compose logs --tail=30 lobby world channel
# Expect (healthy) and "Server ready!"
```

Remove the `.bak-*` tree only after you confirm login works.

---

## SQLite vs MariaDB

Same commands for both. The archive stores whichever backend directories exist:

- SQLite → `data/database/*.sqlite3`
- MariaDB → `data/mariadb/` (full datadir; restore on the same major MariaDB image)

Do not mix: restoring a MariaDB datadir while `data/config` still says `SQLITE3`
(or the reverse) will fail. Restore keeps config + DB together from one archive.

---

## Upgrade (binaries only)

Data stays on the host; only the image changes.

```bash
cd ~/docker/smt
docker compose pull
docker compose up -d
# MariaDB: docker compose --profile mariadb pull && docker compose --profile mariadb up -d
```

Optional dated pin:

```bash
COMP_IMAGE=colpertac/smt-comp:20260722 docker compose up -d
```

Take a backup before upgrading if you care about rollback of **data** (config /
DB / datastore), not only the image tag.

---

## Rollback

**Image rollback** (keep current data):

```bash
cd ~/docker/smt
COMP_IMAGE=colpertac/smt-comp:YYYYMMDD docker compose up -d
```

**Data rollback** (keep current image):

```bash
./scripts/restore.sh --archive ./backups/smt-runtime-….tar.gz --data ./data --compose . --yes
```

**Both:** restore archive, then set `COMP_IMAGE` to the tag recorded in the
archive `MANIFEST.txt` (view with `tar -xOf archive.tar.gz ./MANIFEST.txt`).

---

## Suggested cadence

| When | Action |
| --- | --- |
| Before image upgrade | `backup.sh` |
| Before MariaDB ↔ SQLite switch | `backup.sh` |
| Daily / weekly on Oracle | cron `backup.sh --out /path` + off-box copy |
| After successful restore test | delete old `data.bak-*` and aging archives |

Off-box copy example:

```bash
rsync -a ~/docker/smt/backups/ user@backup-host:smt-backups/
```
