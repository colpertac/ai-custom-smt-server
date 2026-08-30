# COMP shop seed (install bundle)

Official Japanese COMP shops copied from `comp_hack/datastore/shops/compshop-*.xml`
(IDs 301, 327, 640–647). Dev-only working-copy shops (e.g. test shop 648) are **not**
included.

Refresh from a dev checkout:

```bash
./deploy/scripts/stage-server-content-seed.sh
```

After editing via `/admin/shops`, publish shops into the channel datastore the same
way as other content packages.
