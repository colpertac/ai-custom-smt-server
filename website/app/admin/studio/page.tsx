import type { Metadata } from "next"
import Link from "next/link"

import { StudioDressPanel } from "@/features/admin/components/StudioDressPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Portrait studio",
}

export default async function AdminStudioPage() {
  await requireAdmin()

  return (
    <section className="mx-auto max-w-3xl px-4 py-10">
      <p className="mb-4 text-xs">
        <Link href="/admin" className="hover:text-gold-dim">
          ← Admin
        </Link>
      </p>
      <h1 className="font-heading text-3xl font-semibold tracking-[0.12em] uppercase">
        Portrait studio
      </h1>
      <div className="gold-rule mt-3 max-w-xs" />
      <p className="mt-4 text-sm text-muted-foreground">
        Dress online mannequins (<code className="text-foreground">vam1</code> /{" "}
        <code className="text-foreground">vaf1</code>) via the channel loopback
        studio API. The website BFF holds the token — same as curl, with a
        button.
      </p>
      <StudioDressPanel />
    </section>
  )
}
