# Client updater (Phase 9)

HTTP overlay-first update server for distributing custom client files. See
[AI/phases/phase9.md](../AI/phases/phase9.md) and [guides/updater.md](../guides/updater.md).

Layout (generated paths are gitignored):

```text
updater/
  base/           # hashlist.dat (overlay-only seed, or full catalog)
  overlay/        # replacement files + comp_rehash output
  site/           # static page shown in the updater UI
  VersionData.txt.example
  ImagineUpdate.dat.example
  config.env.example
```

Quick start (private server):

```bash
cp updater/config.env.example updater/config.env
cmake --build /home/cat/repos/smt/comp_hack/build-current --target comp_rehash -j16
./scripts/seed-updater-base.sh --overlay-only
./scripts/build-client-overlay.sh                  # if BinaryData/Event changed
./scripts/build-updater-overlay.sh                 # every publish
# Docker compose `updater` service, or: ./scripts/serve-updater-local.py
```

**Always rehash** after changing `client-overlay/`. Point a disposable client's
`ImagineUpdate-user.dat` at the update host (see `ImagineUpdate-user.dat.example`).
