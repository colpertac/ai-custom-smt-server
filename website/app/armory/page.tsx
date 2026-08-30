import type { Metadata } from "next"

import { ArmorySearch } from "@/features/armory/components/ArmorySearch"

export const metadata: Metadata = {
  title: "Armory",
}

export default function ArmoryPage() {
  return (
    <section className="site-atmosphere mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-heading text-3xl font-semibold tracking-[0.12em] uppercase">
        Character armory
      </h1>
      <div className="gold-rule mt-3 max-w-xs" />
      <p className="mt-4 max-w-xl text-sm text-muted-foreground">
        Public lookup by exact character name. Shows level, stats, clan, and
        equipped gear. Account login names and bags stay private.
      </p>
      <div className="mt-8 border-2 border-border bg-card/60 p-4">
        <ArmorySearch autoFocus />
      </div>
    </section>
  )
}
