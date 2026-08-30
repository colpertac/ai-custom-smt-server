# Updater seed (install bundle)

Minimal overlay-only updater manifest so ImagineUpdate can fetch
`/files/hashlist.ver` on a fresh install (empty overlay, no custom client files yet).

Contents:

- `base/hashlist.dat` — overlay-only base catalog (no vanilla file list)
- `overlay/hashlist.{ver,dat,dat.compressed}` — from `comp_rehash` on empty overlay
- `site/index.html` — static page at updater root

Refresh (dev machine with `comp_rehash` built):

```bash
./deploy/scripts/stage-updater-seed.sh
```

After publishing custom client files, ops rehash updates `overlay/hashlist.*` on the
live `UPDATER_ROOT` — this seed is only the first-boot default.
