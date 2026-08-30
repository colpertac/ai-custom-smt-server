# Phase 0 Baseline

Recorded 2026-07-18.

## Source snapshot

COMP_hack:

- Working directory: `/home/cat/repos/smt/comp_hack`
- Local branch: `ai-custom-server`
- Baseline commits:
  - `e49bf25a` — ignore generated local server runtime state
  - `a2c09ae4` — support local-only builds without Git remotes
  - `0514648e` — track Linux build helper
  - `fbd709a7` — modern Linux server baseline
- Upstream base commit: `e87c598c9f3d75db2f8fe8bc9929aaa65244b51d`
- Git remotes: none

libcomp submodule:

- Local branch: `ai-custom-baseline`
- Baseline commits:
  - `46ec2d6` — support local-only builds without Git remotes
  - `4d0abed` — modern GCC compatibility fixes
- Upstream base commit: `9b050ab4a20eee57da4799f202a24cc3e3be32cd`
- Git remotes: none

The source commits contain only the modern GCC include fixes and the local
Linux build/setup/start/systemd helper scripts.

## Client snapshot

- Client lineage/version: Reimagine, configured for game version `1666`
- Working path: `/home/cat/software/smt/game/reimagine`
- `ImagineClient.exe` SHA-256:
  `58edac4eca2d663ac5020b432aa2e8884d683c7236598824e152989a7246c46b`
- `comp_client.dll` SHA-256:
  `0ff3553557b183516b254d3635b93cba2259eecd28fdcf16503cb182508a998d`

## Runtime paths

- Config: `/etc/comp_hack`
- Data and SQLite databases: `/var/lib/comp_hack`
- Logs: `/var/log/comp_hack`
- Built server binaries:
  `/home/cat/repos/smt/comp_hack/build-current/bin`

All runtime paths are currently owned by local user `cat`. No systemd units or
dedicated service account are installed.

The baseline was rebuilt successfully after removing all remotes. Its startup
banner reports `URL: local-only`.

Server binary SHA-256 values:

- `comp_lobby`:
  `cfdd4e95ab6e0af872a12ff3ba868b2f5201676fb680bddec81bbeca2e983ba7`
- `comp_world`:
  `6c721b6460e653a509ed7fe020406b587ba281c12afcbb9a5535ad06dd0f37c1`
- `comp_channel`:
  `3ee1dedfededabe9185abe37c780c1777e16ededa0be0bf84d6a54e1798c3d16`

## Recovery backup

Local recovery snapshot:

```text
/home/cat/backups/ai-custom-smt/phase0-2026-07-18
```

It contains:

- Git bundles for COMP_hack, libcomp, and this customization workspace
- `/etc/comp_hack`
- `/var/lib/comp_hack`, including SQLite databases and server BinaryData
- `/var/log/comp_hack`
- Full working Reimagine client
- Checksums for databases and key client files

This backup protects against experiments, not disk failure, because it is on
the same machine. Copy it to another disk before treating it as disaster
recovery.

## Normal build and smoke test

```bash
cd /home/cat/repos/smt/comp_hack

./scripts/build.sh
./scripts/setup.sh
./scripts/start.sh
./scripts/status.sh

# Launch the Reimagine client and verify:
# 1. account login
# 2. character selection
# 3. entering a zone

./scripts/stop.sh
```

`setup.sh` synchronizes datastore files and should not be run casually after
custom content has been placed directly in `/var/lib/comp_hack/datastore`.
Custom work should have reproducible source in this workspace.

## Runtime restore

Stop all server processes before restoring:

```bash
cd /home/cat/repos/smt/comp_hack
./scripts/stop.sh

BACKUP=/home/cat/backups/ai-custom-smt/phase0-2026-07-18

sudo rsync -aH --delete "$BACKUP/runtime/etc-comp_hack/" /etc/comp_hack/
sudo rsync -aH --delete "$BACKUP/runtime/var-lib-comp_hack/" /var/lib/comp_hack/
sudo rsync -aH --delete "$BACKUP/runtime/var-log-comp_hack/" /var/log/comp_hack/
rsync -aH --delete "$BACKUP/client/reimagine/" \
  /home/cat/software/smt/game/reimagine/
```

Verify database and client checksums:

```bash
sha256sum -c "$BACKUP/runtime/database-sha256.txt"
sha256sum -c "$BACKUP/client/client-sha256.txt"
```

The checksum manifests contain backup-side absolute paths, so this verifies
the backup itself. Compare restored files separately when diagnosing a restore.

## Source restore from bundles

```bash
BACKUP=/home/cat/backups/ai-custom-smt/phase0-2026-07-18

git clone "$BACKUP/source/comp_hack.bundle" restored-comp_hack
cd restored-comp_hack
git switch ai-custom-server

rm -rf libcomp
git clone "$BACKUP/source/libcomp.bundle" libcomp
git -C libcomp switch ai-custom-baseline
git submodule status

cd ..
git clone "$BACKUP/source/ai_custom_smt_server.bundle" \
  restored-ai_custom_smt_server
```

Do not add a writable upstream remote. If a private backup repository is
created later, verify its URL before the first push.

## Files that remain local/private

Do not place these in a public repository:

- Extracted or rebuilt client `BinaryData`
- Client events, maps, models, textures, audio, and other game assets
- Client executables and DLLs
- SQLite databases and account information
- Live config containing credentials or private keys
- Full updater base/overlay payloads

Human-authored patches, scripts, schemas, translation mappings, build tooling,
and documentation can be versioned separately when they do not embed
proprietary data.

## Verification performed

- COMP_hack and libcomp worktrees were clean after snapshot commits.
- Server rebuild completed successfully with no Git remotes configured.
- Lobby, world, and channel started and opened ports 10666, 18666, and 14666.
- Account manager and lobby root returned HTTP 200 on port 10999.
- Servers shut down cleanly after the smoke test.
- Runtime and client backup trees matched their live sources.
- Both copied SQLite databases returned `PRAGMA integrity_check = ok`.
- All source Git bundles verified as complete histories.

The channel still logs the previously known missing
`MD01_002_02t.qmp` geometry warning. It does not block startup or the earlier
confirmed in-game login/play test.

