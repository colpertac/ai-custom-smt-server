# Phase 7 Notes

Completed 2026-07-20 (minimal POC).

Website lives at [`website/`](../website/) (Next.js 16 + shadcn, your preset
theme). Architecture:

```text
Browser → Next.js (BFF + httpOnly sealed cookie)
             → COMP lobby http://127.0.0.1:10999/api
```

Auth is **not** BetterAuth/JWT replacing COMP. The BFF runs the lobby
SHA-512 challenge flow, then seals `{ username, passwordHash, challenge }`
in an encrypted cookie (`SESSION_SECRET`). See [lobby-api.md](lobby-api.md).

## Local run

```bash
cd /home/cat/repos/smt/ai_custom_smt_server/website
cp .env.example .env.local   # set SESSION_SECRET
pnpm dev
```

Requires lobby listening on `COMP_API_URL` (default `http://127.0.0.1:10999`).

## MVP pages

| Route | Purpose |
| --- | --- |
| `/` | Brand landing |
| `/register` | Account create via COMP |
| `/login` | Challenge login |
| `/account` | Details + password change |

## Deferred (polish / post-MVP)

Moved to Phase 16A — see [phase16.md](phase16.md) and
[IDEA_ROADMAP.md](../IDEA_ROADMAP.md).

- Character CRUD and social features (need new COMP APIs)
