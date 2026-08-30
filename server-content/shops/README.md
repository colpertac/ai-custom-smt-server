# COMP shop working copy (Phase 16C)

Editable copies of `compshop-*.xml`. The admin UI at `/admin/shops` reads and
writes **only** this directory (or `COMP_SHOPS_DIR`). It never mutates live
`comp_hack` runtime or Docker volumes.

## Seed

From `ai_custom_smt_server/`:

```bash
./scripts/shop-seed-working-copy.sh
```

Source defaults to `../comp_hack/datastore/shops/`. Override with
`COMP_SHOPS_SRC` / `COMP_SHOPS_DIR`.

## Install into channel

After editing, download XML (or zip) from the admin UI and copy into the
channel datastore `shops/` tree, then restart/reload content the same way you
do for other packages.

## Git

`compshop-*.xml` files here are gitignored. Keep this README and `.gitkeep`.
