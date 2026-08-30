import type { Metadata } from "next"

import {
  AccountLabChrome,
  STUB_ACCOUNT,
} from "@/components/design-lab/account-kit"
import { StubButton } from "@/components/design-lab/kit"

export const metadata: Metadata = {
  title: "Lab · Account COMP console",
}

/**
 * test5/account — terminal property editor / COMP console.
 * Dense monospace panes, no SaaS cards.
 */
export default function Test5AccountPage() {
  const rows = [
    ["username", STUB_ACCOUNT.username],
    ["email", STUB_ACCOUNT.email],
    ["cp", String(STUB_ACCOUNT.cp)],
    ["tickets", String(STUB_ACCOUNT.tickets)],
    ["characters", String(STUB_ACCOUNT.characters)],
    ["user_level", String(STUB_ACCOUNT.userLevel)],
    ["enabled", "true"],
    ["last_login", STUB_ACCOUNT.lastLogin],
  ] as const

  return (
    <AccountLabChrome activeVariant="5" className="bg-[#020403] font-mono">
      <div
        className="min-h-[calc(100svh-4.5rem)] px-3 py-3"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgb(0 0 0 / 0.22) 2px, rgb(0 0 0 / 0.22) 3px)",
        }}
      >
        <div className="mx-auto grid max-w-5xl gap-2 lg:grid-cols-[180px_1fr_200px]">
          {/* Process list */}
          <aside className="border border-[#1f3d1c] bg-[#061008]/95 text-[0.7rem] text-[#6a9a68]">
            <div className="border-b border-[#1f3d1c] px-2 py-1 text-[0.6rem] tracking-widest text-[#3d5c3a]">
              PROCESSES
            </div>
            <ul>
              {[
                "acct.overview *",
                "acct.email",
                "acct.passwd",
                "acct.chars",
                "acct.sessions",
                "sys.admin",
              ].map((p, i) => (
                <li key={p}>
                  <button
                    type="button"
                    title="Stub"
                    className={
                      i === 0
                        ? "w-full cursor-default bg-[#0c2010] px-2 py-1 text-left text-[#9ae89a]"
                        : "w-full cursor-default px-2 py-1 text-left hover:bg-[#0a180c]"
                    }
                  >
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* Main buffer */}
          <main className="border border-[#1f3d1c] bg-[#061008]/95">
            <div className="flex items-center justify-between border-b border-[#1f3d1c] px-2 py-1 text-[0.65rem]">
              <span className="text-[#6dc256]">
                buffer://account/{STUB_ACCOUNT.username}
              </span>
              <span className="text-[#3d5c3a]">rw- · stub</span>
            </div>

            <pre className="overflow-x-auto p-3 text-[0.7rem] leading-relaxed text-[#8fbf8c]">
              <span className="text-[#3d5c3a]"># account dump (read)</span>
              {"\n"}
              {rows.map(([k, v]) => (
                <span key={k}>
                  <span className="text-[#3d5c3a]">{k.padEnd(14)}</span>
                  <span className="text-[#9ae89a]">{v}</span>
                  {"\n"}
                </span>
              ))}
            </pre>

            <div className="border-t border-[#1f3d1c] p-3">
              <p className="text-[0.6rem] tracking-widest text-[#3d5c3a]">
                MUTATORS
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="block border border-[#1f3d1c] bg-black/40 p-2 text-[0.65rem]">
                  <span className="text-[#3d5c3a]">set email</span>
                  <input
                    disabled
                    defaultValue={STUB_ACCOUNT.email}
                    className="mt-1 w-full cursor-not-allowed bg-transparent text-[#9ae89a] outline-none"
                  />
                </label>
                <label className="block border border-[#1f3d1c] bg-black/40 p-2 text-[0.65rem]">
                  <span className="text-[#3d5c3a]">set password</span>
                  <input
                    disabled
                    type="password"
                    placeholder="********"
                    className="mt-1 w-full cursor-not-allowed bg-transparent text-[#9ae89a] outline-none placeholder:text-[#2a4a28]"
                  />
                </label>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <StubButton className="border-[#3d5c3a] bg-[#1a3a18] py-1 text-[0.65rem] text-[#9ae89a] hover:bg-[#2a5a28]">
                  commit
                </StubButton>
                <StubButton
                  variant="outline"
                  className="border-[#1f3d1c] py-1 text-[0.65rem] text-[#6a9a68]"
                >
                  discard
                </StubButton>
              </div>
            </div>
          </main>

          {/* Watch / console */}
          <aside className="space-y-2">
            <div className="border border-[#1f3d1c] bg-[#061008]/95 p-2 text-[0.65rem] text-[#6a9a68]">
              <p className="tracking-widest text-[#3d5c3a]">WATCH</p>
              <ul className="mt-1 space-y-0.5 font-mono">
                <li>lobby … OK</li>
                <li>session … active</li>
                <li>mailer … OFF</li>
              </ul>
            </div>
            <div className="border border-[#1f3d1c] bg-[#061008]/95 p-2 text-[0.65rem] leading-relaxed text-[#4a7a48]">
              COMP console account view — property dump + mutators, no card
              stack. Closest to “functional IDE” in monospace form.
            </div>
            <StubButton
              variant="danger"
              className="w-full border-[#3d1c1c] bg-[#1a0808] py-1 text-[0.65rem] text-[#c88] hover:border-[#911]"
            >
              wipe account
            </StubButton>
          </aside>
        </div>
      </div>
    </AccountLabChrome>
  )
}
