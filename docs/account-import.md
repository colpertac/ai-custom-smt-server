# Character / account import

Vanilla COMP lobby can ingest an **account export XML** (characters, demons,
items, …) via `POST /import` on the lobby HTTP port (default **10999**).

Client dumps live under the game **`Backups/`** folder (Reimagine / Amala
account backup XML: root `<objects>` with `Account` + `Character` graphs).

Import is baked into this stack: lobby schema defaults, runtime/deploy
`lobby.xml`, webroot `import.html`, website admin UI, and player character
import on `/account`.

## Website — player character import (recommended for players)

1. Sign in on the site.
2. Open **`/account`** → **Import characters**.
3. Upload a `Backups/*.xml` file. A modal lists characters in the dump.
4. Select which characters to attach to **this** login; rename if the name
   is already taken on the world.
5. Confirm. Unknown items (not in this server’s wiki/ItemData catalog) and
   unknown demons (not in DevilData) are removed. Account depot / warehouse
   boxes in the dump are **not** imported. Dump password, CP, tickets, and
   GM level are ignored. Destination account privileges are unchanged.

BFF:

- `POST /api/account/characters/import/preview` (multipart `backupXml`) →
  stages the file and returns character list / collisions / strip preview
- `POST /api/account/characters/import/confirm` (JSON `uploadToken` +
  `selections[]`) → sanitize → lobby `POST /import` (ephemeral account) →
  reassign characters onto the session account in lobby/world SQLite

Requires lobby `AllowImport=true` and private `COMP_API_URL` (same as admin).

### Player sanitize matrix

| Field / object | Behavior |
| --- | --- |
| Dump `Account` | Discarded (not merged onto login) |
| `UserLevel` / `CP` / tickets / bans / password | Ignored |
| Character `Name` | Keep or rename; must pass uniqueness + `CharacterNameRegex` |
| Object UUIDs | Always remapped (avoids collisions) |
| `Item.Type` unknown on this server | Item removed; refs nulled |
| `Demon.Type` unknown on this server | Demon removed; COMP slots nulled |
| Account `ITEM_DEPO` / shared demon depot | Skipped |
| Character slots | Needs free slots (max 20); does **not** consume tickets |
| Ephemeral lobby account | Created with `RegistrationUserLevel`, then deleted after attach |

## Website admin (full account restore)

1. Lobby running; `COMP_API_URL` reachable from the website process.
2. Sign in as admin (`userLevel >= 1000`).
3. Open **`/admin/accounts`**, upload the XML under Import account.

BFF: `POST /api/admin/import` → lobby `POST /import` (multipart field
`accountToImport`). This creates a **new** lobby account from the dump
(not attach-to-existing). Prefer player import when the goal is “add my
characters to my login.”

## Vanilla lobby page (optional)

Served from lobby WebRoot when the lobby HTTP port is reachable:

`http://127.0.0.1:10999/accountmanager/import.html`

Source copy: `comp_hack/contrib/webroot/accountmanager/import.html`  
(also under `comp_hack/runtime/webroot/...` for local runs).

Form posts to relative `/import` on the same host:port — no hardcoded IP.

**Security:** do not expose `10999` publicly. Lobby `/import` has **no
password** when `AllowImport` is true. Prefer website admin or `/account`.

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
| `RegistrationUserLevel` | Used for ephemeral accounts in player import |

Restart lobby after changing these members.

## Sanitize on admin whole-account import (current + TODO)

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
DB (player import remaps UUIDs first). Success JSON:
`{ "error": "Success" }` (yes, the field is named `error`).
