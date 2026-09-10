# Golden Ark casino (Flash)

Lobby hosts Flash front-ends plus thin HTML wrappers.

| Path | Files |
|------|--------|
| `casino/slot/` | `index.html` + `Slots.swf` (upload via Admin) |
| `casino/roulette/` | `index.html` + `Roulette.swf` |
| `casino/kino/` | `index.html` + `Kino.swf` |

`.swf` binaries are **not** committed (copyright). Operators upload them
from **Admin → Casino**. Wrappers pass session query params and set
`target_ip` to the same lobby host (`/api/webgame/*`).

HTML/JS fallback UIs (no Flash) live under `casino/html-fallback/`.

## Players

1. Fresh client download pack (Admin → Download) so machines open casino URLs.
2. Windows: install [Clean Flash Player](https://gitlab.com/cleanflash/installer/-/releases) once.
3. Linux/Wine: Flash ActiveX in the game prefix is unreliable; prefer a Windows client for casino.
