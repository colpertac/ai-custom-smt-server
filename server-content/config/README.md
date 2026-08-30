# Server config working copy (Lane A)

Editable copies of process config XMLs. The admin editor at `/admin/config`
reads and writes here, then **Apply & restart** stages them into live
`comp_hack/runtime/config/` (or `OPS_RUNTIME/config`).

| File | Role |
| --- | --- |
| `lobby.xml` | LobbyConfig |
| `world.xml` | WorldConfig + WorldSharedConfig |
| `channel.xml` | ChannelConfig |
| `setup.xml` | First-boot seed Accounts (optional) |
| `constants.xml` | Shared server constants |
| `newcharacter.xml` | Channel starter Character kit |

Missing files are seeded from live on first open. Do not put zone packages here
— those go through Content zip ingest.
