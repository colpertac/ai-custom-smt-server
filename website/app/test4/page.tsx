import type { Metadata } from "next"

import {
  LabViewport,
  StubButton,
  StubLink,
  VariantSwitcher,
} from "@/components/design-lab/kit"

export const metadata: Metadata = {
  title: "Lab · Banner private-server",
}

/** Variant 4 — ChromieCraft-ish banner + polished private-server marketing. */
export default function Test4Page() {
  return (
    <LabViewport className="bg-[#0e0e0e]">
      <VariantSwitcher active="4" />

      {/* Top bar */}
      <div className="border-b border-[#2a2a2a] bg-[#141414]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className="font-heading text-lg tracking-[0.2em] text-[#e8ecf4] uppercase">
            Imagine <span className="text-[#d3b800]">Private</span>
          </p>
          <nav className="flex flex-wrap items-center gap-4 text-xs tracking-[0.14em] uppercase text-[#aaa]">
            <StubLink className="hover:text-[#d3b800]">News</StubLink>
            <StubLink className="hover:text-[#d3b800]">Download</StubLink>
            <StubLink className="hover:text-[#d3b800]">Status</StubLink>
            <StubLink className="hover:text-[#d3b800]">Guides</StubLink>
            <StubButton className="ml-2">Play now</StubButton>
          </nav>
        </div>
      </div>

      {/* Full-bleed banner */}
      <section
        className="relative flex min-h-[22rem] items-end border-b border-[#2a2a2a] sm:min-h-[28rem]"
        style={{
          background:
            "linear-gradient(180deg, transparent 30%, #0e0e0e 100%), radial-gradient(ellipse at 60% 30%, #2a3a55 0%, transparent 50%), linear-gradient(135deg, #1a1520 0%, #0e0e0e 45%, #162032 100%)",
        }}
      >
        <div className="relative mx-auto w-full max-w-5xl px-4 py-10">
          <p className="text-[0.7rem] tracking-[0.4em] text-[#d3b800] uppercase">
            Progressive private realm
          </p>
          <h1 className="mt-3 max-w-xl font-heading text-4xl leading-tight tracking-[0.08em] text-white uppercase sm:text-5xl">
            Return to Tokyo
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-[#b0b6c4]">
            Account portal, updater, and status for a Shin Megami Tensei:
            IMAGINE private server — built for players who still remember the
            COMP.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <StubButton className="px-5 py-2.5 text-sm">Create account</StubButton>
            <StubButton variant="outline" className="px-5 py-2.5 text-sm">
              Download client
            </StubButton>
          </div>
        </div>
      </section>

      {/* Feature row */}
      <section className="mx-auto grid max-w-5xl gap-px bg-[#2a2a2a] sm:grid-cols-3">
        {[
          {
            t: "Account",
            d: "Register, manage password, and keep your characters on this realm.",
          },
          {
            t: "Updater",
            d: "Point ImagineUpdate at our BaseURL — hashlist served from the host.",
          },
          {
            t: "Status",
            d: "Lobby and channel probes from the website BFF. World stays internal.",
          },
        ].map((f) => (
          <div key={f.t} className="bg-[#141414] px-5 py-6">
            <h2 className="font-heading text-sm tracking-[0.2em] text-[#d3b800] uppercase">
              {f.t}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#8b93a7]">{f.d}</p>
            <StubLink className="mt-3 inline-block text-xs text-[#ced3e0]">
              Learn more →
            </StubLink>
          </div>
        ))}
      </section>

      {/* News teaser */}
      <section className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex items-end justify-between gap-4 border-b border-[#2a2a2a] pb-3">
          <h2 className="font-heading text-xl tracking-[0.15em] uppercase">
            Latest news
          </h2>
          <StubLink className="text-xs text-[#8b93a7]">All posts</StubLink>
        </div>
        <ul className="mt-4 space-y-4">
          {[
            ["2026-07-24", "Remote play smoke complete"],
            ["2026-07-20", "GM command discoverability in-game"],
            ["2026-07-15", "Portal account registration opens"],
          ].map(([date, title]) => (
            <li
              key={title}
              className="flex flex-wrap items-baseline gap-3 text-sm"
            >
              <span className="font-mono text-xs text-[#666]">{date}</span>
              <StubLink className="text-[#ced3e0] hover:text-[#d3b800]">
                {title}
              </StubLink>
            </li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-[#2a2a2a] py-6 text-center text-[0.7rem] text-[#555]">
        Unofficial fan project · stub marketing layout (~20% modern polish)
      </footer>
    </LabViewport>
  )
}
