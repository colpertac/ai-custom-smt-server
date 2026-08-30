import type { Metadata } from "next"
import Link from "next/link"

import { AccountImportPanel } from "@/features/admin/components/AccountImportPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Import account",
}

export default async function AdminImportPage() {
  await requireAdmin()

  return (
    <section className="mx-auto max-w-3xl px-4 py-10">
      <p className="mb-4 text-xs">
        <Link href="/admin" className="hover:text-gold-dim">
          ← Admin
        </Link>
      </p>
      <h1 className="font-heading text-3xl font-semibold tracking-[0.12em] uppercase">
        Import account
      </h1>
      <div className="gold-rule mt-3 max-w-xs" />
      <p className="mt-4 text-sm text-muted-foreground">
        Upload a COMP account export XML. The website BFF forwards it to lobby{" "}
        <code className="text-foreground">POST /import</code> (same handler as
        vanilla <code className="text-foreground">import.html</code>). Keep
        lobby :10999 off the public internet.
      </p>
      <AccountImportPanel />
    </section>
  )
}
