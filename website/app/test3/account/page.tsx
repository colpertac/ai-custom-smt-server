import type { Metadata } from "next"

import {
  AccountLabChrome,
  STUB_ACCOUNT,
  StubField,
} from "@/components/design-lab/account-kit"
import { StubButton, StubLink } from "@/components/design-lab/kit"

export const metadata: Metadata = {
  title: "Lab · Account forum control",
}

/**
 * test3/account — denser control panel: tabs + data table + side actions.
 * Forum green accents, admin-console density.
 */
export default function Test3AccountPage() {
  return (
    <AccountLabChrome activeVariant="3" className="bg-[#0d0d0d]">
      <div className="mx-auto max-w-[1100px] px-2 py-2">
        <div className="flex flex-wrap items-end justify-between gap-2 border border-[#222] bg-[#121212] px-3 py-2">
          <div>
            <p className="text-[0.6rem] tracking-wider text-[#6dc256] uppercase">
              Member control panel
            </p>
            <h1 className="text-lg font-semibold text-[#e8ecf4]">
              {STUB_ACCOUNT.username}{" "}
              <span className="font-mono text-xs text-[#6dc256]">
                lvl {STUB_ACCOUNT.userLevel}
              </span>
            </h1>
          </div>
          <div className="flex gap-1">
            <StubButton
              variant="outline"
              className="border-[#333] py-1 text-[0.65rem] hover:border-[#6dc256]"
            >
              PM user
            </StubButton>
            <StubButton className="border-[#1b5b0a] bg-[#116f10] py-1 text-[0.65rem] text-white hover:bg-[#6dc256]">
              Edit profile
            </StubButton>
          </div>
        </div>

        {/* Tab strip */}
        <div className="mt-1 flex flex-wrap gap-0 border border-[#222] border-t-0 bg-[#1a1a1a] text-[0.7rem]">
          {[
            "Summary",
            "Credentials",
            "Characters",
            "Posts",
            "Moderation",
          ].map((t, i) => (
            <button
              key={t}
              type="button"
              title="Stub"
              className={
                i === 0
                  ? "cursor-default border-b-2 border-[#6dc256] bg-[#121212] px-3 py-1.5 text-[#6dc256]"
                  : "cursor-default border-b-2 border-transparent px-3 py-1.5 text-[#888] hover:text-[#ccc]"
              }
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mt-1 grid gap-1 lg:grid-cols-[1fr_220px]">
          <div className="space-y-1">
            {/* Dense key-value table */}
            <table className="w-full border border-[#222] bg-[#121212] text-left text-xs">
              <tbody>
                {(
                  [
                    ["Username", STUB_ACCOUNT.username],
                    ["Email", STUB_ACCOUNT.email],
                    ["CP", STUB_ACCOUNT.cp.toLocaleString()],
                    ["Tickets", String(STUB_ACCOUNT.tickets)],
                    ["Characters", String(STUB_ACCOUNT.characters)],
                    ["User level", String(STUB_ACCOUNT.userLevel)],
                    ["Enabled", "Yes"],
                    ["Last login", STUB_ACCOUNT.lastLogin],
                    ["Joined", "—"],
                    ["IP (last)", "hidden"],
                  ] as const
                ).map(([k, v], i) => (
                  <tr
                    key={k}
                    className={i % 2 === 0 ? "bg-[#121212]" : "bg-[#161616]"}
                  >
                    <th className="w-36 border-b border-[#1c1c1c] px-3 py-1.5 font-medium text-[#6dc256]">
                      {k}
                    </th>
                    <td className="border-b border-[#1c1c1c] px-3 py-1.5 font-mono text-[#ccc]">
                      {v}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="grid gap-1 sm:grid-cols-2">
              <div className="border border-[#222] bg-[#121212] p-2">
                <p className="mb-2 text-[0.65rem] font-semibold tracking-wider text-[#6dc256] uppercase">
                  Update email
                </p>
                <StubField label="Email" defaultValue={STUB_ACCOUNT.email} />
                <StubButton className="mt-2 border-[#1b5b0a] bg-[#116f10] py-1 text-[0.65rem] text-white hover:bg-[#6dc256]">
                  Save
                </StubButton>
              </div>
              <div className="border border-[#222] bg-[#121212] p-2">
                <p className="mb-2 text-[0.65rem] font-semibold tracking-wider text-[#6dc256] uppercase">
                  Reset password
                </p>
                <StubField label="New" type="password" />
                <StubField
                  label="Confirm"
                  type="password"
                  className="mt-1"
                />
                <StubButton
                  variant="outline"
                  className="mt-2 border-[#333] py-1 text-[0.65rem]"
                >
                  Apply
                </StubButton>
              </div>
            </div>
          </div>

          <aside className="space-y-1">
            <div className="border border-[#222] bg-[#121212] p-2 text-xs">
              <p className="text-[0.65rem] font-semibold tracking-wider text-[#6dc256] uppercase">
                Quick actions
              </p>
              <ul className="mt-2 space-y-1 text-[#aaa]">
                {[
                  "View characters",
                  "Force logout",
                  "Grant CP…",
                  "Set user level…",
                  "Ban account…",
                ].map((a) => (
                  <li key={a}>
                    <StubLink className="text-[#d2e5ff] hover:text-[#6dc256]">
                      › {a}
                    </StubLink>
                  </li>
                ))}
              </ul>
            </div>
            <div className="border border-[#222] bg-[#121212] p-2 text-[0.65rem] leading-relaxed text-[#666]">
              Forum-admin density: zebra property table, tab strip, action rail —
              less whitespace than SaaS cards.
            </div>
          </aside>
        </div>
      </div>
    </AccountLabChrome>
  )
}
