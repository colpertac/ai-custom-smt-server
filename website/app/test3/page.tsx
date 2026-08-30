import type { Metadata } from "next"

import {
  LabViewport,
  StubButton,
  StubLink,
  VariantSwitcher,
} from "@/components/design-lab/kit"

export const metadata: Metadata = {
  title: "Lab · Forum denser",
}

const threads = [
  {
    board: "Announcements",
    title: "Welcome to the private realm",
    meta: "Pinned · 42 replies",
  },
  {
    board: "Client / Setup",
    title: "Updater BaseURL and VersionData checklist",
    meta: "Last: yesterday",
  },
  {
    board: "Bugs",
    title: "Logout timer still shows stock countdown",
    meta: "Last: 3 hours ago",
  },
  {
    board: "Looking for party",
    title: "Shinjuku evening runs — need demon sync",
    meta: "Last: 20 min ago",
  },
] as const

/** Variant 3 — denser forum / community home. */
export default function Test3Page() {
  return (
    <LabViewport className="bg-[#0d0d0d]">
      <VariantSwitcher active="3" />
      <div className="mx-auto max-w-[960px] px-3 py-4">
        {/* Logo banner */}
        <header className="border border-[#1b5b0a]/40 bg-[#0c0c0c] px-4 py-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[0.65rem] tracking-[0.35em] text-[#6dc256] uppercase">
                Community portal
              </p>
              <h1 className="mt-1 font-heading text-3xl tracking-[0.12em] text-[#e8ecf4] uppercase">
                Imagine Online
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <StubButton variant="outline">Log in</StubButton>
              <StubButton>Register</StubButton>
            </div>
          </div>
          <nav className="mt-4 flex flex-wrap gap-1 border-t border-[#222] pt-3 text-xs uppercase tracking-wider text-[#aaa]">
            {[
              "Home",
              "Forums",
              "Download",
              "Status",
              "Wiki",
              "Discord",
            ].map((item, i) => (
              <span key={item} className="flex items-center gap-1">
                {i > 0 ? <span className="text-[#333]">·</span> : null}
                <StubLink className="text-[#ced3e0] hover:text-[#6dc256]">
                  {item}
                </StubLink>
              </span>
            ))}
          </nav>
        </header>

        {/* Status strip */}
        <div className="mt-3 grid grid-cols-2 gap-px border border-[#222] bg-[#222] sm:grid-cols-4">
          {[
            ["Lobby", "UP"],
            ["Channel", "UP"],
            ["Updater", "UP"],
            ["Players", "18 online"],
          ].map(([label, value]) => (
            <div key={label} className="bg-[#141414] px-3 py-2 text-center">
              <p className="text-[0.65rem] tracking-wider text-[#666] uppercase">
                {label}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-[#6dc256]">
                {value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_240px]">
          <section className="border border-[#222] bg-[#121212]">
            <div className="flex items-center justify-between border-b border-[#222] bg-[#1a1a1a] px-3 py-2">
              <h2 className="text-xs font-semibold tracking-wider text-[#6dc256] uppercase">
                Latest activity
              </h2>
              <StubLink className="text-[0.7rem] text-[#888]">View all</StubLink>
            </div>
            <ul>
              {threads.map((t) => (
                <li
                  key={t.title}
                  className="flex flex-col gap-0.5 border-b border-[#1c1c1c] px-3 py-3 last:border-0 hover:bg-[#181818] sm:flex-row sm:items-baseline sm:justify-between"
                >
                  <div>
                    <p className="text-[0.65rem] text-[#6dc256]">{t.board}</p>
                    <StubLink className="text-sm text-[#d2e5ff] hover:text-white">
                      {t.title}
                    </StubLink>
                  </div>
                  <p className="text-[0.7rem] text-[#666]">{t.meta}</p>
                </li>
              ))}
            </ul>
          </section>

          <aside className="space-y-3">
            <div className="border border-[#222] bg-[#121212] p-3">
              <h2 className="text-xs font-semibold tracking-wider text-[#6dc256] uppercase">
                Get in
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-[#888]">
                Create an account, grab the client, point the updater here.
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <StubButton className="w-full">Create account</StubButton>
                <StubButton variant="outline" className="w-full">
                  Download client
                </StubButton>
              </div>
            </div>
            <div className="border border-[#222] bg-[#121212] p-3">
              <h2 className="text-xs font-semibold tracking-wider text-[#6dc256] uppercase">
                Shoutbox
              </h2>
              <ul className="mt-2 space-y-2 text-[0.7rem] text-[#aaa]">
                <li>
                  <span className="text-[#6dc256]">Maya</span>: anyone running
                  Suginami?
                </li>
                <li>
                  <span className="text-[#6dc256]">Kai</span>: updater hashlist
                  refreshed
                </li>
                <li>
                  <span className="text-[#888]">(stub)</span> typing disabled
                </li>
              </ul>
            </div>
          </aside>
        </div>

        <p className="mt-4 text-center text-[0.65rem] text-[#555]">
          Forum-lean variant uses green accents (western community nostalgia)
          instead of gold — for comparison only.
        </p>
      </div>
    </LabViewport>
  )
}
