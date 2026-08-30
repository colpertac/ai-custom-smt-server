# Armory catalogs

`devils.json` — demon type ID → display name, extracted from client
`BinaryData/Shield/DevilData.xml` (5302 entries).

Regenerate:

```bash
node --input-type=module <<'EOF'
# see extract snippet used in Phase 16E armory work
EOF
```

Skill display names are not in Shield `SkillData` (no CDATA names); armory
shows skill IDs until a message-table extract exists.

Expertise labels live in `website/lib/armory-catalogs.ts` (Constants.h.in).
