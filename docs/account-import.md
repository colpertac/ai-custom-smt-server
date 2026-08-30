# Character / account import

Vanilla COMP lobby can ingest an **account export XML** (characters, demons,
items, …) via `POST /import` on the lobby HTTP port (default **10999**).

Import is baked into this stack: lobby schema defaults, runtime/deploy
`lobby.xml`, webroot `import.html`, and website admin UI. No setup script.

## Website admin (recommended)

1. Lobby running; `COMP_API_URL` reachable from the website process.
2. Sign in as admin (`userLevel >= 1000`).
3. Open **`/admin/import`**, upload the XML.

BFF: `POST /api/admin/import` → lobby `POST /import` (multipart field
`accountToImport`).

## Vanilla lobby page (optional)

Served from lobby WebRoot when the lobby HTTP port is reachable:

`http://127.0.0.1:10999/accountmanager/import.html`

Source copy: `comp_hack/contrib/webroot/accountmanager/import.html`  
(also under `comp_hack/runtime/webroot/...` for local runs).

Form posts to relative `/import` on the same host:port — no hardcoded IP.

**Security:** do not expose `10999` publicly. Lobby `/import` has **no
password** when `AllowImport` is true. Prefer website admin.

## Lobby config

Schema defaults (`lobbyconfig.xml`): `AllowImport=true`, strip user level/CP,
`ImportWorld=0`, max payload 5120 KiB. Explicit members in runtime/deploy
`lobby.xml` keep the same.

| Member | Purpose |
| --- | --- |
| `AllowImport` | Must be `true` or lobby returns 401 |
| `WebListeningPort` | `10999` (also used by website `COMP_API_URL`) |
| `ImportWorld` | World ID to attach imported characters (default `0`) |
| `ImportStripUserLevel` | Strip GM level from dump (default true) |
| `ImportStripCP` | Strip CP from dump (default true) |
| `ImportMaxPayload` | Max POST size in KiB (default 5120) |

Restart lobby after changing these members.

## Sanitize on import (current + TODO)

Already applied in `LobbyServer::CheckImportObject` when strip flags are on:

- `UserLevel` → `0` (`ImportStripUserLevel`)
- `CP` → `0` (`ImportStripCP`)

So a dumped admin account should **not** keep GM level or cash points — as
long as those flags stay `true`. Do not turn them off on a shared host.

**TODO (roadmap 16H):** harden further — `TicketCount`, `Enabled`,
`APIOnly`, ban fields, password/salt policy, fail-closed if strips disabled,
optional economy caps. Tracked in [IDEA_ROADMAP.md](../IDEA_ROADMAP.md)
§16H.

## Import failures

Lobby refuses if any object UUID in the dump already exists in lobby or world
DB. Success JSON: `{ "error": "Success" }` (yes, the field is named `error`).
