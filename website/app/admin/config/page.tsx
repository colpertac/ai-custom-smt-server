import type { Metadata } from "next"
import Link from "next/link"

import { ServerConfigPanel } from "@/features/admin-config/components/ServerConfigPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Server config",
}

export default async function AdminConfigPage() {
  await requireAdmin()

  return (
    <section className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-heading text-3xl font-semibold tracking-[0.12em] uppercase">
        Server config
      </h1>
      <div className="gold-rule mt-3 max-w-xs" />
      <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
        Schema-driven editor for{" "}
        <code className="text-xs">lobby.xml</code>,{" "}
        <code className="text-xs">world.xml</code>,{" "}
        <code className="text-xs">channel.xml</code>, plus setup / constants /
        newcharacter. Save to the working copy, then Apply &amp; restart to
        stage into live config (Lane A).
      </p>

      <ServerConfigPanel />

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
