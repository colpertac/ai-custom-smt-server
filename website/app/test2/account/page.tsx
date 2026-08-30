import type { Metadata } from "next"

import {
  AccountLabChrome,
  PropRow,
  STUB_ACCOUNT,
  StubField,
} from "@/components/design-lab/account-kit"
import { StubButton } from "@/components/design-lab/kit"

export const metadata: Metadata = {
  title: "Lab · Account NewOrder tool",
}

const editors = [
  "Account",
  "Email",
  "Password",
  "Characters",
  "Ban / flags",
] as const

/**
 * test2/account — Blender-like: outliner + properties editor + workspace tabs.
 * Keeps NewOrder gold/slate chrome.
 */
export default function Test2AccountPage() {
  return (
    <AccountLabChrome activeVariant="2" className="bg-[#000]">
      <div className="mx-auto flex min-h-[calc(100svh-4.5rem)] max-w-[1100px] flex-col border-x border-[#1e293e]">
        {/* Editor menu bar */}
        <div className="flex flex-wrap items-center gap-1 border-b border-[#1e293e] bg-[#0d1524] px-2 py-1 text-[0.65rem]">
          {["File", "Account", "Window", "Help"].map((m) => (
            <button
              key={m}
              type="button"
              title="Stub"
              className="cursor-default px-2 py-0.5 text-[#8b93a7] hover:bg-[#1e293e] hover:text-[#ced3e0]"
            >
              {m}
            </button>
          ))}
          <span className="ml-auto font-mono text-[#cc9d00]">
            imagine.account — {STUB_ACCOUNT.username}
          </span>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Outliner */}
          <aside className="w-44 shrink-0 border-r border-[#1e293e] bg-[#0a101c] text-xs">
            <div className="border-b border-[#1e293e] bg-[#121a28] px-2 py-1 text-[0.6rem] tracking-wider text-[#cc9d00] uppercase">
              Outliner
            </div>
            <ul className="font-mono text-[0.7rem]">
              <li className="px-2 py-1 text-[#d3b800]">▾ Account</li>
              <li className="bg-[#1e293e] px-2 py-1 pl-4 text-[#e8ecf4]">
                · Credentials
              </li>
              <li className="px-2 py-1 pl-4 text-[#8b93a7] hover:bg-[#121a28]">
                · Characters
              </li>
              <li className="px-2 py-1 pl-4 text-[#8b93a7] hover:bg-[#121a28]">
                · Sessions
              </li>
              <li className="px-2 py-1 text-[#8b93a7]">▾ Server</li>
              <li className="px-2 py-1 pl-4 text-[#8b93a7]">· Status</li>
              <li className="px-2 py-1 pl-4 text-[#8b93a7]">· Admin</li>
            </ul>
          </aside>

          {/* Center workspace */}
          <main className="flex min-w-0 flex-1 flex-col bg-[#1e293e]">
            <div className="flex gap-0 border-b border-[#334155] bg-[#162032]">
              {editors.map((tab, i) => (
                <button
                  key={tab}
                  type="button"
                  title="Stub"
                  className={
                    i === 0
                      ? "cursor-default border-r border-[#334155] bg-[#1e293e] px-3 py-1.5 text-[0.7rem] text-[#d3b800]"
                      : "cursor-default border-r border-[#334155] px-3 py-1.5 text-[0.7rem] text-[#8b93a7] hover:text-[#ced3e0]"
                  }
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="grid flex-1 gap-0 md:grid-cols-2">
              <section className="border-b border-[#334155] p-3 md:border-r md:border-b-0">
                <h2 className="mb-2 text-[0.65rem] tracking-wider text-[#cc9d00] uppercase">
                  Properties
                </h2>
                <dl className="border border-[#334155] bg-[#141c2b] px-2">
                  <PropRow label="Username" value={STUB_ACCOUNT.username} mono />
                  <PropRow label="Email" value={STUB_ACCOUNT.email} mono />
                  <PropRow label="CP" value={String(STUB_ACCOUNT.cp)} mono />
                  <PropRow label="Tickets" value={String(STUB_ACCOUNT.tickets)} />
                  <PropRow
                    label="Characters"
                    value={String(STUB_ACCOUNT.characters)}
                  />
                  <PropRow
                    label="User level"
                    value={String(STUB_ACCOUNT.userLevel)}
                    mono
                  />
                  <PropRow label="Enabled" value="Yes" />
                  <PropRow label="Last login" value={STUB_ACCOUNT.lastLogin} />
                </dl>
              </section>

              <section className="space-y-3 p-3">
                <h2 className="text-[0.65rem] tracking-wider text-[#cc9d00] uppercase">
                  Edit operators
                </h2>
                <div className="space-y-2 border border-[#334155] bg-[#141c2b] p-2">
                  <StubField
                    label="Email"
                    defaultValue={STUB_ACCOUNT.email}
                  />
                  <div className="flex gap-1">
                    <StubButton className="py-1 text-[0.65rem]">Apply</StubButton>
                    <StubButton variant="ghost" className="py-1 text-[0.65rem]">
                      Reset
                    </StubButton>
                  </div>
                </div>
                <div className="space-y-2 border border-[#334155] bg-[#141c2b] p-2">
                  <StubField label="New password" type="password" />
                  <StubField label="Confirm" type="password" />
                  <StubButton variant="outline" className="py-1 text-[0.65rem]">
                    Execute password change
                  </StubButton>
                </div>
              </section>
            </div>
          </main>

          {/* N-panel style */}
          <aside className="hidden w-40 shrink-0 border-l border-[#1e293e] bg-[#0a101c] xl:block">
            <div className="border-b border-[#1e293e] bg-[#121a28] px-2 py-1 text-[0.6rem] tracking-wider text-[#cc9d00] uppercase">
              N · Tool
            </div>
            <div className="space-y-2 p-2 text-[0.65rem] text-[#8b93a7]">
              <p>Operators</p>
              <StubButton variant="outline" className="w-full py-1 text-[0.6rem]">
                Sync lobby
              </StubButton>
              <StubButton variant="outline" className="w-full py-1 text-[0.6rem]">
                Copy username
              </StubButton>
              <StubButton variant="danger" className="w-full py-1 text-[0.6rem]">
                Ban…
              </StubButton>
              <p className="pt-2 leading-relaxed">
                Split panes + outliner + N-panel = Blender density, NewOrder
                colors.
              </p>
            </div>
          </aside>
        </div>

        <footer className="flex items-center gap-3 border-t border-[#1e293e] bg-[#0d1524] px-2 py-0.5 font-mono text-[0.6rem] text-[#666]">
          <span>Ready</span>
          <span className="text-[#cc9d00]">Verts: n/a</span>
          <span className="ml-auto">Memory: stub</span>
        </footer>
      </div>
    </AccountLabChrome>
  )
}
