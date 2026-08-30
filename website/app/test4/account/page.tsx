import type { Metadata } from "next"

import {
  AccountLabChrome,
  MetricChip,
  STUB_ACCOUNT,
  StubField,
  ToolSidebar,
} from "@/components/design-lab/account-kit"
import { StubButton } from "@/components/design-lab/kit"

export const metadata: Metadata = {
  title: "Lab · Account Creator Studio",
}

/**
 * test4/account — closest to YouTube Studio:
 * icon rail + content list + detail pane, dashboard cards.
 */
export default function Test4AccountPage() {
  return (
    <AccountLabChrome activeVariant="4" className="bg-[#0f0f0f]">
      <div className="flex min-h-[calc(100svh-4.5rem)]">
        {/* Narrow icon rail */}
        <aside className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-[#2a2a2a] bg-[#1a1a1a] py-2">
          {["⌂", "◎", "♟", "⚿", "⚙"].map((icon, i) => (
            <button
              key={icon}
              type="button"
              title="Stub"
              className={
                i === 0
                  ? "flex size-9 cursor-default items-center justify-center rounded-full bg-[#2a2a2a] text-sm text-[#d3b800]"
                  : "flex size-9 cursor-default items-center justify-center rounded-full text-sm text-[#888] hover:bg-[#222] hover:text-[#ccc]"
              }
            >
              {icon}
            </button>
          ))}
        </aside>

        <ToolSidebar active="credentials" accent="#d3b800" />

        <div className="flex min-w-0 flex-1 flex-col bg-[#0f0f0f]">
          <header className="flex items-center gap-3 border-b border-[#2a2a2a] px-4 py-2">
            <div>
              <h1 className="text-base font-medium text-white">Channel · Account</h1>
              <p className="text-[0.7rem] text-[#888]">
                Dashboard for realm credentials (stub)
              </p>
            </div>
            <div className="ml-auto flex gap-2">
              <StubButton variant="outline" className="rounded-full py-1.5 text-[0.65rem]">
                Analytics
              </StubButton>
              <StubButton className="rounded-full py-1.5 text-[0.65rem]">
                Create
              </StubButton>
            </div>
          </header>

          <main className="space-y-3 overflow-auto p-4">
            <div className="grid gap-2 sm:grid-cols-4">
              <MetricChip
                label="CP balance"
                value={STUB_ACCOUNT.cp.toLocaleString()}
                accent="#d3b800"
              />
              <MetricChip label="Tickets" value={String(STUB_ACCOUNT.tickets)} />
              <MetricChip
                label="Characters"
                value={String(STUB_ACCOUNT.characters)}
              />
              <MetricChip
                label="Access level"
                value={String(STUB_ACCOUNT.userLevel)}
              />
            </div>

            {/* Content row: list + detail */}
            <div className="grid min-h-[22rem] gap-0 border border-[#2a2a2a] lg:grid-cols-[240px_1fr]">
              <div className="border-b border-[#2a2a2a] bg-[#1a1a1a] lg:border-r lg:border-b-0">
                <p className="border-b border-[#2a2a2a] px-3 py-2 text-[0.65rem] tracking-wider text-[#888] uppercase">
                  Content
                </p>
                <ul className="text-xs">
                  {[
                    ["Email settings", true],
                    ["Password", false],
                    ["Linked characters", false],
                    ["Login history", false],
                    ["API tokens", false],
                  ].map(([label, on]) => (
                    <li key={String(label)}>
                      <button
                        type="button"
                        title="Stub"
                        className={
                          on
                            ? "flex w-full cursor-default border-l-2 border-[#d3b800] bg-[#222] px-3 py-2.5 text-left text-[#e8ecf4]"
                            : "flex w-full cursor-default border-l-2 border-transparent px-3 py-2.5 text-left text-[#aaa] hover:bg-[#181818]"
                        }
                      >
                        {label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-[#141414] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-medium text-white">
                      Email settings
                    </h2>
                    <p className="mt-1 max-w-md text-xs text-[#888]">
                      Recovery contact for this account. Without email, lost
                      passwords cannot be recovered (no mailer yet).
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#2a2a2a] px-2 py-0.5 text-[0.6rem] text-[#d3b800]">
                    Published
                  </span>
                </div>

                <div className="mt-4 max-w-md space-y-3">
                  <StubField
                    label="Email"
                    defaultValue={STUB_ACCOUNT.email}
                  />
                  <div className="flex gap-2">
                    <StubButton className="rounded-full py-1.5 text-[0.65rem]">
                      Save
                    </StubButton>
                    <StubButton
                      variant="ghost"
                      className="rounded-full py-1.5 text-[0.65rem]"
                    >
                      Cancel
                    </StubButton>
                  </div>
                </div>

                <div className="mt-8 border-t border-[#2a2a2a] pt-4">
                  <h3 className="text-xs font-medium text-[#ccc]">
                    Password (also on this panel)
                  </h3>
                  <div className="mt-2 grid max-w-md gap-2 sm:grid-cols-2">
                    <StubField label="New" type="password" />
                    <StubField label="Confirm" type="password" />
                  </div>
                  <StubButton
                    variant="outline"
                    className="mt-2 rounded-full py-1.5 text-[0.65rem]"
                  >
                    Update password
                  </StubButton>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </AccountLabChrome>
  )
}
