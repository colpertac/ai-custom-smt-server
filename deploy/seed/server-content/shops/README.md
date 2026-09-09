# COMP shop seed (install bundle)

Default CP shops for fresh installs (`compshop-6001.xml` …), staged from the
dev working copy at `server-content/shops/`.

Refresh from a checkout that has your current admin shops:

```bash
./deploy/scripts/stage-server-content-seed.sh
```

Override the shop source (e.g. stock Japanese shops only):

```bash
COMP_SHOPS_SRC=../comp_hack/datastore/shops \
  ./deploy/scripts/stage-server-content-seed.sh
```

After install, shops live under `website-data/server-content/shops/`. Publish
into the channel datastore the same way as other content packages.
