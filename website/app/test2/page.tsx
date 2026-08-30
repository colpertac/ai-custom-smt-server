import type { Metadata } from "next"

import {
  LabViewport,
  StubButton,
  StubLink,
  VariantSwitcher,
} from "@/components/design-lab/kit"

export const metadata: Metadata = {
  title: "Lab · NewOrder frame",
}

const rail = [
  "Home",
  "News",
  "Download",
  "Support",
  "Status",
  "Register",
  "Log in",
] as const

/** Variant 2 — NewOrder-style fixed frame + left rail. */
export default function Test2Page() {
  return (
    <LabViewport className="bg-black">
      <VariantSwitcher active="2" />
      <div
        className="mx-auto min-h-[calc(100svh-2.5rem)] max-w-[912px] px-2 py-4"
        style={{
          backgroundImage:
            "linear-gradient(180deg, #1a2030 0%, #000 120px), repeating-linear-gradient(90deg, transparent, transparent 3px, rgb(255 255 255 / 0.015) 3px, rgb(255 255 255 / 0.015) 4px)",
        }}
      >
        {/* Banner strip */}
        <div className="relative h-28 overflow-hidden border border-[#1e293e] bg-[#0d1524]">
          <div
            className="absolute inset-0 opacity-40"
            style={{
              background:
                "radial-gradient(ellipse at 30% 40%, #3a4a6a 0%, transparent 55%), linear-gradient(90deg, #000 0%, transparent 40%)",
            }}
          />
          <div className="relative flex h-full flex-col justify-end px-5 pb-3">
            <p className="font-mono text-[0.65rem] tracking-[0.4em] text-[#cc9d00] uppercase">
              Shin Megami Tensei: Imagine
            </p>
            <p className="font-heading text-2xl tracking-[0.2em] text-[#ced3e0] uppercase">
              NewOrder-style frame
            </p>
          </div>
        </div>

        <div className="mt-0 flex border border-t-0 border-[#1e293e]">
          {/* Left rail */}
          <aside className="w-[202px] shrink-0 border-r border-[#1e293e] bg-[#0a101c] py-2">
            <p className="px-3 py-2 font-mono text-[0.65rem] tracking-widest text-[#cc9d00] uppercase">
              Menu
            </p>
            <ul className="font-mono text-xs">
              {rail.map((item) => (
                <li key={item}>
                  <button
                    type="button"
                    title="Stub — not wired"
                    className="block w-full cursor-default border-b border-[#1e293e]/80 px-3 py-2 text-left text-[#ced3e0] hover:bg-[#1e293e] hover:text-[#d3b800]"
                  >
                    » {item}
                  </button>
                </li>
              ))}
            </ul>
            <div className="m-3 border border-[#911] bg-[#111] p-3 text-center">
              <p className="font-mono text-[0.65rem] text-[#ffc9c9]">Client</p>
              <StubButton className="mt-2 w-full" variant="danger">
                Download
              </StubButton>
            </div>
          </aside>

          {/* Content */}
          <main className="min-w-0 flex-1 bg-[#1e293e]">
            <div
              className="flex h-[72px] items-end border-b border-[#334155] px-6 pb-3"
              style={{
                background:
                  "linear-gradient(180deg, #2a3a55 0%, #1e293e 100%)",
              }}
            >
              <h1 className="font-heading text-xl tracking-[0.15em] text-[#e8ecf4] uppercase">
                Support / Home
              </h1>
            </div>
            <div className="space-y-5 px-6 py-6 font-mono text-sm leading-relaxed text-[#ced3e0]">
              <p>
                To play on this private server, create an account on the portal,
                then run the updater against our BaseURL.
              </p>
              <div className="border border-[#334155] bg-[#141c2b] p-4">
                <p className="border-b border-[#d3b800] pb-2 text-[#d3b800]">
                  Notices
                </p>
                <ul className="mt-3 space-y-2 text-xs text-[#8b93a7]">
                  <li>
                    <StubLink>· Realm maintenance window — Sundays 04:00 UTC</StubLink>
                  </li>
                  <li>
                    <StubLink>· Client build notes updated</StubLink>
                  </li>
                  <li>
                    <StubLink>· Password reset mailer is not live yet</StubLink>
                  </li>
                </ul>
              </div>
              <div className="flex flex-wrap gap-2">
                <StubButton>Create account</StubButton>
                <StubButton variant="outline">Open status</StubButton>
              </div>
              <p className="text-[0.7rem] text-[#8b93a7]">
                Links hover gold (#cc9d00). Body uses cool gray-blue on slate —
                matching the archived NewOrder support page.
              </p>
            </div>
          </main>
        </div>
      </div>
    </LabViewport>
  )
}
