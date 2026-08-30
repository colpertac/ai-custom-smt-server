import type { Metadata } from "next"
import Link from "next/link"

import { DungeonPayoutsPanel } from "@/features/admin-payouts/components/DungeonPayoutsPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Dungeon payouts",
}

export default async function AdminPayoutsPage() {
  await requireAdmin()

  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-heading text-3xl font-semibold tracking-[0.12em] uppercase">
        Dungeon payouts
      </h1>
      <div className="gold-rule mt-3 max-w-xs" />
      <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
        Spreadsheet of dungeon families × Bronze / Silver / Gold (inline CP).
        Expand variants (Bearcat, boss paths, …). Click a cell for crates,
        clear items, enable, and package export. Working copy only — no live
        mutation.
      </p>

      <DungeonPayoutsPanel />

      <p className="mt-8 text-sm">
        <Link
          href="/admin"
          className="underline underline-offset-2 hover:text-gold-dim"
        >
          Back to admin
        </Link>
      </p>
    </section>
  )
}
