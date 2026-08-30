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
    <section className="mx-auto max-w-4xl px-4 py-10">
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
        Dress mannequins that are <strong>logged into the game world</strong>{" "}
        on the channel (<code className="text-foreground">vam1</code> /{" "}
        <code className="text-foreground">vaf1</code>). Offline here means the
        character is not in-world yet — not that the Wine PC is unreachable.
        Snap uses <code className="text-foreground">PORTRAIT_PREVIEW_URL</code>{" "}
        (homelab preview agent) when clients are not on this machine.
      </p>
      <StudioDressPanel />
    </section>
  )
}
