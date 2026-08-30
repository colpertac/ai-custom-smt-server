# Client overlay

Rebuilt BinaryData (and later other client assets) that get copied into a game
client tree. Proprietary bins are gitignored; rebuild from `client-source/`.

```bash
../scripts/build-client-overlay.sh
../scripts/apply-client-overlay.sh /path/to/reimagine-client
# matching server Shield ItemData/CItemData:
../scripts/install-phase3-shield.sh
```

See [../guides/client-binarydata.md](../guides/client-binarydata.md) and
[../docs/phase3.md](../docs/phase3.md).
