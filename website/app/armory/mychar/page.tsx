import type { Metadata } from "next"
import Link from "next/link"

import { ArmoryMyCharPanel } from "@/features/armory/components/ArmoryMyCharPanel"

export const metadata: Metadata = {
  title: "My characters",
}

export default function ArmoryMyCharPage() {
  return (
    <section className="site-atmosphere mx-auto max-w-3xl px-4 py-8">
      <p className="mb-4 text-xs">
        <Link href="/armory" className="hover:text-gold-dim">
          ← Armory
        </Link>
      </p>
      <h1 className="font-heading text-3xl font-semibold tracking-[0.12em] uppercase">
        My characters
      </h1>
      <div className="gold-rule mt-3 max-w-xs" />
      <p className="mt-4 text-sm text-muted-foreground">
        Characters on your account. If an admin enabled expertise / digi edit,
        open a character to change those values.
      </p>
      <div className="mt-8 border-2 border-border bg-card/60 p-4">
        <ArmoryMyCharPanel />
      </div>
    </section>
  )
}
