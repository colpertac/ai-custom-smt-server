import type { Metadata } from "next"

import {
  DESIGN_VARIANTS,
  LabViewport,
  VariantSwitcher,
} from "@/components/design-lab/kit"

export const metadata: Metadata = {
  title: "Design lab",
}

export default function DesignLabIndexPage() {
  return (
    <LabViewport>
      <VariantSwitcher active="" />
      <div className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-[0.7rem] font-semibold tracking-[0.35em] text-[#cc9d00] uppercase">
          Design lab
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-heading)] text-3xl font-bold tracking-[0.12em] text-[#e8ecf4] uppercase">
          Website variants
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-[#8b93a7]">
          Stub mockups only — buttons and account flows are not wired. Pick a
          direction; we can promote one into the live portal later.
        </p>

        <h2 className="mt-10 text-xs font-semibold tracking-[0.2em] text-[#d3b800] uppercase">
          Homes
        </h2>
        <ul className="mt-3 space-y-3">
          {DESIGN_VARIANTS.map((v) => (
            <li key={v.href}>
              <a
                href={v.href}
                className="block border border-[#334155] bg-[#1e293e]/60 px-4 py-4 no-underline transition-colors hover:border-[#cc9d00]"
              >
                <span className="font-[family-name:var(--font-heading)] text-lg tracking-wide text-[#e8ecf4]">
                  /test{v.id} — {v.name}
                </span>
                <span className="mt-1 block text-sm text-[#8b93a7]">
                  {v.blurb}
                </span>
              </a>
            </li>
          ))}
        </ul>

        <h2 className="mt-10 text-xs font-semibold tracking-[0.2em] text-[#d3b800] uppercase">
          Account mockups
        </h2>
        <p className="mt-2 text-sm text-[#8b93a7]">
          Same stub account data. Prefer{" "}
          <a href="/test6/account" className="text-[#d3b800] hover:underline">
            /test6/account
          </a>{" "}
          if the tool UIs feel too heavy for gamers.
        </p>
        <ul className="mt-3 space-y-2">
          {[
            ["6", "Gamer portal (recommended middle)"],
            ["1", "Studio + inspector"],
            ["2", "Blender outliner / N-panel"],
            ["3", "Forum admin control panel"],
            ["4", "YouTube Studio channel"],
            ["5", "COMP console dump"],
          ].map(([id, label]) => (
            <li key={id}>
              <a
                href={`/test${id}/account`}
                className="flex items-center justify-between border border-[#334155] bg-[#1e293e]/40 px-4 py-3 no-underline hover:border-[#cc9d00]"
              >
                <span className="text-[#e8ecf4]">/test{id}/account</span>
                <span className="text-xs text-[#8b93a7]">{label}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </LabViewport>
  )
}
