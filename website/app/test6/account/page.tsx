import type { Metadata } from "next"
import Link from "next/link"

import {
  AccountLabChrome,
  STUB_ACCOUNT,
  StubField,
} from "@/components/design-lab/account-kit"
import { StubButton } from "@/components/design-lab/kit"

export const metadata: Metadata = {
  title: "Lab · Gamer account",
}

/**
 * test6/account — half modern / half functional.
 * Gold + slate. One screen: who you are, what matters, change password.
 * No outliner, inspector, or deep tab trees.
 */
export default function Test6AccountPage() {
  return (
    <AccountLabChrome activeVariant="6" className="site-atmosphere">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
        {/* Identity header — friendly, not a tool chrome */}
        <header className="flex flex-wrap items-end justify-between gap-4 border border-[#2a3344] bg-[#1e293e]/80 px-5 py-5">
          <div>
            <p className="text-[0.7rem] tracking-[0.25em] text-[#cc9d00] uppercase">
              Signed in
            </p>
            <h1 className="font-heading mt-1 text-3xl font-bold tracking-[0.08em] text-[#e8ecf4] uppercase">
              {STUB_ACCOUNT.username}
            </h1>
            <p className="mt-2 text-sm text-[#8b93a7]">
              Same login for this site and the game client.
            </p>
          </div>
          <StubButton variant="outline" className="py-1.5 text-[0.7rem]">
            Log out
          </StubButton>
        </header>

        {/* At-a-glance — 3 numbers only, not a dashboard */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(
            [
              ["CP", STUB_ACCOUNT.cp.toLocaleString()],
              ["Characters", String(STUB_ACCOUNT.characters)],
              ["Level", String(STUB_ACCOUNT.userLevel)],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              className="border border-[#2a3344] bg-[#141c2b] px-3 py-3 text-center"
            >
              <p className="text-[0.65rem] tracking-wider text-[#8b93a7] uppercase">
                {label}
              </p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-[#d3b800]">
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* One readable info block — not a property inspector */}
        <section className="mt-3 border border-[#2a3344] bg-[#1e293e]/60 px-5 py-5">
          <h2 className="font-heading text-sm tracking-[0.15em] text-[#d3b800] uppercase">
            Account info
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            {(
              [
                ["Username", STUB_ACCOUNT.username],
                ["Email", STUB_ACCOUNT.email],
                ["Tickets", String(STUB_ACCOUNT.tickets)],
                ["Status", STUB_ACCOUNT.enabled ? "Active" : "Disabled"],
                ["Last login", STUB_ACCOUNT.lastLogin],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#2a3344]/80 pb-3 last:border-0 last:pb-0"
              >
                <dt className="text-[#8b93a7]">{label}</dt>
                <dd className="text-right font-medium text-[#e8ecf4]">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Two clear actions — email + password, side by side on desktop */}
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <section className="border border-[#2a3344] bg-[#1e293e]/60 px-5 py-5">
            <h2 className="font-heading text-sm tracking-[0.15em] text-[#d3b800] uppercase">
              Email
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-[#8b93a7]">
              Optional. Used if we add password recovery later.
            </p>
            <div className="mt-4 space-y-3">
              <StubField label="Email" defaultValue={STUB_ACCOUNT.email} />
              <StubButton className="w-full py-2 text-[0.7rem] sm:w-auto">
                Save email
              </StubButton>
            </div>
          </section>

          <section className="border border-[#2a3344] bg-[#1e293e]/60 px-5 py-5">
            <h2 className="font-heading text-sm tracking-[0.15em] text-[#d3b800] uppercase">
              Change password
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-[#8b93a7]">
              You&apos;ll need to sign in again after changing it.
            </p>
            <div className="mt-4 space-y-3">
              <StubField label="New password" type="password" />
              <StubField label="Confirm password" type="password" />
              <StubButton
                variant="outline"
                className="w-full py-2 text-[0.7rem] sm:w-auto"
              >
                Update password
              </StubButton>
            </div>
          </section>
        </div>

        <p className="mt-6 text-center text-xs text-[#666]">
          Gamer-facing middle ground — one page, three jobs (see info / email /
          password).{" "}
          <Link
            href="/test"
            className="text-[#8b93a7] no-underline hover:text-[#cc9d00]"
          >
            Back to lab
          </Link>
        </p>
      </div>
    </AccountLabChrome>
  )
}
