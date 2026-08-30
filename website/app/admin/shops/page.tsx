import type { Metadata } from "next"
import Link from "next/link"

import { CompShopsPanel } from "@/features/admin-shops/components/CompShopsPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "COMP shops",
}

export default async function AdminShopsPage() {
  await requireAdmin()

  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-heading text-3xl font-semibold tracking-[0.12em] uppercase">
        COMP shops
      </h1>
      <div className="gold-rule mt-3 max-w-xs" />
      <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
        Edit working-copy <code className="text-xs">compshop-*.xml</code> under{" "}
        <code className="text-xs">server-content/shops</code>. Export downloads
        packages for manual install into the channel datastore — this UI does
        not mutate live runtime.
      </p>

      <CompShopsPanel />

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
