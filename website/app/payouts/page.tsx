import type { Metadata } from "next"

import { PublicPayoutsSheet } from "@/features/payouts/components/PublicPayoutsSheet"
import { listPublicPayouts } from "@/lib/public-payouts"

export const metadata: Metadata = {
  title: "Dungeon payouts",
}

export const dynamic = "force-dynamic"

export default async function PayoutsPage() {
  const rows = await listPublicPayouts()

  return (
    <section className="site-atmosphere mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-heading text-3xl font-semibold tracking-[0.12em] uppercase">
        Dungeon payouts
      </h1>
      <div className="gold-rule mt-3 max-w-xs" />
      <p className="mt-4 text-sm text-muted-foreground">
        Switch between CP and Magical Golden Apples (Golden Light). Click a
        family with a chevron to expand variants. Boss-crate item drops are
        configured separately.
      </p>

      <PublicPayoutsSheet rows={rows} />
    </section>
  )
}
