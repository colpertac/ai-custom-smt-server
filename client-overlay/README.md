# Client overlay

Rebuilt BinaryData (and later other client assets) that get copied into a game
client tree. Proprietary bins are gitignored; rebuild from `client-source/`.

```bash
../scripts/build-client-overlay.sh
../scripts/apply-client-overlay.sh /path/to/reimagine-client
# matching server Shield tables (ItemData/CItemData/DevilData):
../scripts/install-shield-overlay.sh
```

See [the BinaryData guides](../guides/binarydata/README.md).
Phase notes: [phase3](../AI/phases/phase3.md), [phase4](../AI/phases/phase4.md),
[phase5](../AI/phases/phase5.md).
