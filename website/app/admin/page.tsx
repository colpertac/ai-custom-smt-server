import type { Metadata } from "next"
import Link from "next/link"

import { AdminAccountsPanel } from "@/features/admin/components/AdminAccountsPanel"
import { requireAdmin } from "@/features/auth/server"
import { ADMIN_USER_LEVEL } from "@/lib/admin-level"

export const metadata: Metadata = {
  title: "Admin",
}

export default async function AdminPage() {
  const session = await requireAdmin()

  return (
    <section className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-heading text-3xl font-semibold tracking-[0.12em] uppercase">
        Admin
      </h1>
      <div className="gold-rule mt-3 max-w-xs" />
      <p className="mt-4 text-sm text-muted-foreground">
        Signed in as <span className="text-foreground">{session.username}</span>{" "}
        (level {session.userLevel ?? "?"} / need ≥ {ADMIN_USER_LEVEL}). Account
        tools talk to lobby admin HTTP through this site&apos;s BFF.
      </p>

      <AdminAccountsPanel />

      <section className="mt-12">
        <h2 className="font-heading text-xl font-semibold tracking-[0.08em] uppercase">
          COMP shops
        </h2>
        <div className="gold-rule mt-2 max-w-[12rem]" />
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          Edit working-copy COMP shop XML (prices, tabs, products) and download
          packages for channel install.
        </p>
        <p className="mt-3 text-sm">
          <Link
            href="/admin/shops"
            className="underline underline-offset-2 hover:text-gold-dim"
          >
            Open COMP shop editor
          </Link>
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-heading text-xl font-semibold tracking-[0.08em] uppercase">
          Dungeon payouts
        </h2>
        <div className="gold-rule mt-2 max-w-[12rem]" />
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          Edit CP, crate loot tables, and clear-item grants; export Event +
          DropSet packages.
        </p>
        <p className="mt-3 text-sm">
          <Link
            href="/admin/payouts"
            className="underline underline-offset-2 hover:text-gold-dim"
          >
            Open dungeon payout editor
          </Link>
        </p>
      </section>

      <p className="mt-8 text-sm">
        <Link
          href="/account"
          className="underline underline-offset-2 hover:text-gold-dim"
        >
          Back to account
        </Link>
      </p>
    </section>
  )
}
