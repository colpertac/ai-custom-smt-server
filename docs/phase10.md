# Phase 10 Notes

Started 2026-07-20.

## Goal

Privileged test behavior that BinaryData/XML alone cannot grant. **Server
owns combat HP** — client `comp_client.xml` must never be enough for
invulnerability.

## Semantics (MVP)

| | |
| --- | --- |
| Mode | GM / developer **session toggle** |
| Command | `@invuln` / `@god` (`[0\|1]` optional; omit = toggle) |
| Effect | Ignore **HP reductions** on character + summoned demon via `SetHPMP` |
| Still allowed | Heals, MP changes |
| Auth | `UserLevel >= GM_CMD_LVL_INVULN` (default **200** in `constants.xml`) |
| Scope | Session only (clears on disconnect); not persisted |

## MVP status

| Step | Status |
| --- | --- |
| Define semantics (GM toggle, not visual-only) | Done |
| `@invuln` / `@god` + `ClientState` flag | Done (needs channel rebuild/restart) |
| Hook `ActiveEntityState::SetHPMP` | Done |
| Constant `GM_CMD_LVL_INVULN` | Done (repo + `/etc/comp_hack/constants.xml`) |
| In-game smoke (take hit with toggle on/off) | Done |
| Locate/rebuild `comp_client.dll` source | Deferred (not in this checkout) |

## Test

1. Account with `UserLevel >= 200` (admin is often 1000).
2. Rebuild/restart channel after pulling these changes.
3. In chat: `@invuln` → expect “Invulnerability enabled…”.
4. Pull aggro / take a hit — HP should not drop.
5. `@invuln` again — damage applies normally.
6. Level-0 account: command rejected; XML alone cannot enable it.

```bash
cd /home/cat/repos/smt/comp_hack/build-current
cmake --build . --target comp_channel -j2
# restart channel service as you usually do
```

## Deferred (polish)

- DLL RE / private `comphack/client/comp_client` (visual HP, other patches)
- Always-on invuln for all high-level accounts (prefer explicit toggle)
- Status effects that bypass HP (instant kill flags) — verify case-by-case
- Partner-only / party-wide options

## Research

- `comp_client.dll` source is **not** in this COMP_hack tree (GitLab
  `comphack/client/comp_client`). Shipped DLL has no invuln patch.
- XML patch names only enable code already in the DLL.
- Damage paths (combat + T-damage) converge on `SetHPMP` — correct hook.
