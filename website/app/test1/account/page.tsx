import type { Metadata } from "next"

import {
  AccountLabChrome,
  MetricChip,
  PropRow,
  STUB_ACCOUNT,
  StubField,
  ToolSidebar,
} from "@/components/design-lab/account-kit"
import { StubButton } from "@/components/design-lab/kit"

export const metadata: Metadata = {
  title: "Lab · Account studio",
}

/**
 * test1/account — YouTube Creator Studio lean:
 * left nav + top metrics + dense property/inspector panes.
 */
export default function Test1AccountPage() {
  return (
    <AccountLabChrome activeVariant="1" className="bg-[#0a0c10]">
      <div className="flex min-h-[calc(100svh-4.5rem)]">
        <ToolSidebar active="overview" />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Studio top bar */}
          <header className="flex flex-wrap items-center gap-3 border-b border-[#2a3344] bg-[#10151f] px-3 py-2">
            <h1 className="text-sm font-semibold tracking-wide text-[#e8ecf4]">
              Overview
            </h1>
            <span className="rounded-sm border border-[#2a3344] px-1.5 py-0.5 font-mono text-[0.6rem] text-[#8b93a7]">
              portal + client credentials
            </span>
            <div className="ml-auto flex gap-1.5">
              <StubButton variant="outline" className="py-1 text-[0.65rem]">
                Refresh
              </StubButton>
              <StubButton className="py-1 text-[0.65rem]">Open admin</StubButton>
            </div>
          </header>

          <div className="grid flex-1 lg:grid-cols-[1fr_280px]">
            {/* Main workspace */}
            <main className="min-w-0 space-y-3 overflow-auto p-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MetricChip
                  label="CP"
                  value={STUB_ACCOUNT.cp.toLocaleString()}
                  accent="#d3b800"
                />
                <MetricChip label="Tickets" value={String(STUB_ACCOUNT.tickets)} />
                <MetricChip
                  label="Characters"
                  value={String(STUB_ACCOUNT.characters)}
                />
                <MetricChip
                  label="User level"
                  value={String(STUB_ACCOUNT.userLevel)}
                  accent="#d3b800"
                />
              </div>

              <section className="border border-[#2a3344] bg-[#10151f]">
                <div className="flex items-center justify-between border-b border-[#2a3344] bg-[#141a26] px-3 py-1.5">
                  <h2 className="text-[0.7rem] font-semibold tracking-wider text-[#d3b800] uppercase">
                    Account properties
                  </h2>
                  <span className="text-[0.6rem] text-[#666]">read-only</span>
                </div>
                <dl className="px-3 py-1">
                  <PropRow label="Username" value={STUB_ACCOUNT.username} mono />
                  <PropRow label="Email" value={STUB_ACCOUNT.email} mono />
                  <PropRow
                    label="Enabled"
                    value={STUB_ACCOUNT.enabled ? "Yes" : "No"}
                  />
                  <PropRow label="Last login" value={STUB_ACCOUNT.lastLogin} />
                </dl>
              </section>

              <div className="grid gap-3 md:grid-cols-2">
                <section className="border border-[#2a3344] bg-[#10151f]">
                  <div className="border-b border-[#2a3344] bg-[#141a26] px-3 py-1.5">
                    <h2 className="text-[0.7rem] font-semibold tracking-wider text-[#d3b800] uppercase">
                      Email
                    </h2>
                  </div>
                  <div className="space-y-2 p-3">
                    <StubField
                      label="Recovery email"
                      defaultValue={STUB_ACCOUNT.email}
                      hint="Optional. No mailer yet — blank = no recovery."
                    />
                    <StubButton className="py-1.5 text-[0.65rem]">
                      Save email
                    </StubButton>
                  </div>
                </section>

                <section className="border border-[#2a3344] bg-[#10151f]">
                  <div className="border-b border-[#2a3344] bg-[#141a26] px-3 py-1.5">
                    <h2 className="text-[0.7rem] font-semibold tracking-wider text-[#d3b800] uppercase">
                      Password
                    </h2>
                  </div>
                  <div className="space-y-2 p-3">
                    <StubField label="New password" type="password" />
                    <StubField label="Confirm" type="password" />
                    <StubButton
                      variant="outline"
                      className="py-1.5 text-[0.65rem]"
                    >
                      Change password
                    </StubButton>
                  </div>
                </section>
              </div>

              <section className="border border-[#2a3344] bg-[#10151f]">
                <div className="border-b border-[#2a3344] bg-[#141a26] px-3 py-1.5">
                  <h2 className="text-[0.7rem] font-semibold tracking-wider text-[#d3b800] uppercase">
                    Characters
                  </h2>
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0c1018] text-[0.65rem] text-[#8b93a7]">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">Name</th>
                      <th className="px-3 py-1.5 font-medium">Lv</th>
                      <th className="px-3 py-1.5 font-medium">Class</th>
                      <th className="px-3 py-1.5 font-medium">Zone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STUB_ACCOUNT.charactersList.map((c) => (
                      <tr
                        key={c.name}
                        className="border-t border-[#1e293e] text-[#8b93a7]"
                      >
                        <td className="px-3 py-2">{c.name}</td>
                        <td className="px-3 py-2 font-mono">{c.level}</td>
                        <td className="px-3 py-2">{c.class}</td>
                        <td className="px-3 py-2">{c.zone}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </main>

            {/* Right inspector — Blender/Creator properties */}
            <aside className="border-t border-[#2a3344] bg-[#0c1018] lg:border-t-0 lg:border-l">
              <div className="border-b border-[#2a3344] px-3 py-1.5">
                <h2 className="text-[0.65rem] font-semibold tracking-wider text-[#8b93a7] uppercase">
                  Inspector
                </h2>
              </div>
              <div className="space-y-3 p-3 text-xs">
                <div>
                  <p className="text-[0.65rem] text-[#666] uppercase">Selected</p>
                  <p className="mt-0.5 font-mono text-[#d3b800]">
                    account:{STUB_ACCOUNT.username}
                  </p>
                </div>
                <dl>
                  <PropRow label="Realm" value="private" />
                  <PropRow label="Auth" value="COMP lobby BFF" />
                  <PropRow label="API" value=":10999 (server-side)" />
                </dl>
                <div className="border border-[#2a3344] bg-[#10151f] p-2 text-[0.65rem] leading-relaxed text-[#8b93a7]">
                  Dense tool layout: sidebar sections, metric strip, property
                  tables, inspector — not a centered blog column.
                </div>
                <StubButton variant="danger" className="w-full py-1.5 text-[0.65rem]">
                  Delete account…
                </StubButton>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </AccountLabChrome>
  )
}
