# AI Custom SMT Server

Planning and source-controlled customization workspace for a personal SMT:
IMAGINE server based on COMP_hack and the 1.666/Reimagine client.

This directory is intentionally separate from:

- `../comp_hack/` — upstream server and tools
- `../ai/` — notes for `smt_py`
- `/home/cat/software/smt/game/reimagine/` — working game client

## Goals

- Custom zones, items, and demons
- Configurable currency/resource compressors, including Golden Apples
- Custom client behavior such as an invulnerability/developer-mode toggle
- A substantially complete English translation
- A modern account and server website
- A reproducible client updater overlay

See [ROADMAP.md](ROADMAP.md) for the recommended order and acceptance checks.
See [docs/research-notes.md](docs/research-notes.md) for concrete early
findings (zone packages, compression IDs, tool gaps).
The frozen Phase 0 state and recovery procedure are in
[docs/baseline.md](docs/baseline.md). New custom identifiers must be recorded
in [docs/ids.md](docs/ids.md).

## Intended layout

Directories should be added as each milestone begins instead of copying the
entire server or client now:

```text
ai_custom_smt_server/
├── docs/                 # Research notes, IDs, formats, decisions
├── server-content/       # Our zones, events, scripts, shops, and packages
├── server-patches/       # Patches applied to a COMP_hack fork
├── client-overlay/       # Only files that replace/add client files
├── translation/          # Human-editable translation source and tooling
└── website/              # Modern website source
```

## Ground rules

1. Keep the currently working server and Reimagine client as known-good
   baselines.
2. Give custom records IDs from a documented private range and maintain an ID
   registry.
3. Never edit the only copy of a compiled BinaryData file; retain source XML
   and a reproducible build command.
4. Client and server definitions must be updated together.
5. Do not commit copyrighted game assets or extracted client BinaryData to a
   public repository.
6. Treat `comp_client.xml` as configuration for features that already exist in
   `comp_client.dll`; XML entries do not implement new features.
7. Put port 10999 behind a private interface/firewall when the website becomes
   remotely accessible.

