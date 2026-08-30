# IMAGINE website

Next.js account portal for the private COMP lobby API.

Structure mirrors [monno](https://github.com/) `apps/web` style where it fits:

```text
app/                 # thin routes + BFF Route Handlers under app/api/
features/
  auth/              # api.ts, hooks.ts, schemas/, components/, server.ts
  account/
  status/
lib/                 # kyClient, fetcher, queryClient, session, comp-api
components/ui/       # shadcn / Base UI
```

**Difference from monno:** there is no NestJS. The browser talks to **same-origin
`/api/*`** (Next BFF). The BFF owns the sealed cookie and calls COMP lobby
`:10999` server-side (challenge SHA-512). Stack: **ky + TanStack Query + RHF + Zod**.

## Setup

```bash
cp .env.example .env.local
# set SESSION_SECRET (openssl rand -base64 48)
pnpm install
pnpm dev
```

Env:

- `COMP_API_URL` — lobby base URL (default `http://127.0.0.1:10999`)
- `SESSION_SECRET` — seals the httpOnly web session cookie
- `SITE_URL` / `COOKIE_SECURE` / `PUBLIC_UPDATER_URL` — Phase 16A portal
  (see [docs/phase16.md](../docs/phase16.md))
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL` / `RESEND_FROM_NAME` — welcome + reset mail (server-only)
- `COMP_RESET_SECRET` — same value required on the **lobby process** for forgot-password APIs

Email layout (monno-style):

```text
email-templates/     # plain HTML factories (Welcome, ResetPassword)
lib/email/           # Resend send + branding + typed helpers
```

## Scripts

- `pnpm dev` — development server
- `pnpm build` / `pnpm start` — production
- `pnpm typecheck` — TypeScript
- `pnpm test` — unit tests (Vitest: auth schemas, login challenge, helpers)

## Notes

- Do not call port 10999 from the browser.
- Theme/tokens live in `app/globals.css` (shadcn preset).
