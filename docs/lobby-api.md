# COMP Lobby REST API

Private HTTP JSON API served by `comp_lobby` (default port **10999**).
The Next.js site talks to it only from server code (`COMP_API_URL`).
Browsers must never call this port.

Also: multipart **account import** at `POST /import` (not under `/api`) —
see [account-import.md](account-import.md). Keep this port private.

Reference implementations:

- `comp_hack/contrib/webroot/accountmanager/index.html`
- `comp_hack/server/lobby/rspec/Session.rb`
- `comp_hack/server/lobby/src/ApiHandler.cpp`

## Auth model (challenge-response)

Not JWT. In-memory sessions keyed by username on the lobby process.

1. `POST /api/auth/get_challenge` with `{ "username" }`  
   → `{ "challenge", "salt" }` (401 if account missing/disabled).  
   Older lobbies returned **400** for the same case; the website BFF maps
   both 400 and 401 from login to a single 401 for the browser.
2. Client (here: Next BFF) computes:
   - `password_hash = SHA-512(password + salt)` (hex)
   - `challenge_reply = SHA-512(password_hash + challenge)` (hex)
3. Authenticated calls send:
   - `session_username`
   - `challenge` = current `challenge_reply`
4. Successful responses include a new plaintext `challenge`; rotate:
   - `challenge_reply = SHA-512(password_hash + new_challenge)`

Passwords in the DB are stored as `SHA-512(password + salt)`.

## Account endpoints (all POST, JSON)

| Path | Auth | Notes |
| --- | --- | --- |
| `/api/auth/get_challenge` | username only | Starts session |
| `/api/account/register` | none | `username`, `password`; `email` optional. Lobby empty-email → placeholder; website BFF also sends `noreply+{user}@local.invalid` when omitted (works with older lobbies that reject blank email). |
| `/api/account/get_details` | challenge | CP, email, character_count, user_level, … |
| `/api/account/get_cp` | challenge | CP only |
| `/api/account/change_password` | challenge | Clears COMP session after success |
| `/api/account/change_display_name` | challenge | Body: `disp_name` (1–32 chars) |
| `/api/account/change_email` | challenge | Body: `email` (empty clears to placeholder) |
| `/api/account/client_login` | challenge | Issues game `sid1`/`sid2` (needs `client_version`) |
| `/api/account/recovery_email` | `reset_secret` + `username` **or** `email` | Website-only. Returns `{ username, email }` (`email` blank for placeholder). Requires lobby env `COMP_RESET_SECRET`. |
| `/api/account/reset_password` | `reset_secret` + username | Website-only. Sets password; clears COMP API session. |

Username: `^[a-z][a-z0-9]{3,31}$` (lowercased).  
Password: 6–16 chars from a fixed allowed set (see `ApiHandler.cpp`).  
Login username is a DB key and is **not** renamable over HTTP.

Website password reset: BFF stores one-time tokens in `website/data/web.sqlite`, emails link via Resend, then calls `reset_password`.

## Admin endpoints

Require `user_level >= 1000` (plus per-route level constants).

| Path | Notes |
| --- | --- |
| `/api/admin/get_accounts` | List all accounts |
| `/api/admin/get_account` | One account by `username` |
| `/api/admin/update_account` | Fields: `password`, `disp_name`, `email`, `cp`, `ticket_count`, `user_level`, `enabled`, `ban_reason`, `ban_initiator` |
| `/api/admin/delete_account` | Delete by `username` |
| `/api/admin/online` | Aggregate online counts (`total`, per-world `character_count`); optional `targets` for account/character lookup |
| `/api/admin/message_world` | World-wide ticker (`type: "ticker"`, `mode` 0–4 like `@announce`) or console chat (`type: "console"`). Requires `world_id` + `message`. Wired in website Admin overview → Announce. |
| `/api/admin/list_chat_logs` | World DB chat log (`character_name`, `since`/`until`, `limit`≤200). Channel persists say/shout/tell/party/clan/team/versus (not SELF); **14-day** prune. Wired in Admin → Chat logs. |
| `/api/admin/list_reports` | Unresolved/resolved `ReportedPlayer` rows (`resolved`, optional `player_name`). Wired in Admin → Reports (detail pulls chat for 30m before `report_time`). |
| `/api/admin/resolve_report` | Mark report resolved by `uid` (+ `world_id`). |
| `/api/admin/get_promos` | List promos (`code`, `startTime`, `endTime`, `useLimit`, `limitType`, `items` as shop product IDs). Wired in website Admin → Promos. |
| `/api/admin/create_promo` | Create promo: `code` (exactly 16 letters A–Z; client Promotion Code field), `startTime`, `endTime`, `useLimit` (0–255; 0 = unlimited), `limitType` (`account`\|`character`\|`world`), `items` (non-empty shop product IDs). |
| `/api/admin/delete_promo` | Delete all promos with `code`. |
| `/api/admin/kick_player`, … | Other tools (not wired in website yet) |

Updating/deleting the session’s own account clears the COMP API session.

## Not available over HTTP today

Friends, clan chat, messaging, character create/delete, login-username rename.
Those remain in-game packets / future lobby REST work.
