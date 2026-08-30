import type { Metadata } from "next"
import Link from "next/link"

import {
  LabViewport,
  StubButton,
  VariantSwitcher,
} from "@/components/design-lab/kit"

export const metadata: Metadata = {
  title: "Lab · Gamer portal",
}

/** Lightweight home for the approachable account direction. */
export default function Test6Page() {
  return (
    <LabViewport className="site-atmosphere">
      <VariantSwitcher active="6" />
      <div className="mx-auto flex min-h-[calc(100svh-2.5rem)] max-w-3xl flex-col justify-center px-4 py-10">
        <p className="font-heading text-[0.7rem] font-semibold tracking-[0.35em] text-gold-dim uppercase">
          Shin Megami Tensei · Imagine
        </p>
        <h1 className="font-heading mt-3 text-4xl font-bold tracking-[0.12em] uppercase">
          Your account
        </h1>
        <p className="mt-4 max-w-lg text-muted-foreground">
          Simple portal home — see the approachable account layout (no deep
          tool menus).
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/test6/account" className="no-underline">
            <StubButton className="min-w-36 px-4 py-2.5 text-sm">
              Open account
            </StubButton>
          </Link>
          <StubButton variant="outline" className="min-w-36 px-4 py-2.5 text-sm">
            Download
          </StubButton>
        </div>
      </div>
    </LabViewport>
  )
}
