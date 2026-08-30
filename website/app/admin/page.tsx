import type { Metadata } from "next"
import Link from "next/link"

import { AdminAccountsPanel } from "@/features/admin/components/AdminAccountsPanel"
import { AdminOpsFirstBoot } from "@/features/admin/components/AdminOpsFirstBoot"
import { AdminOpsHealth } from "@/features/admin/components/AdminOpsHealth"
import { AdminOpsIngest } from "@/features/admin/components/AdminOpsIngest"
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

      <AdminOpsFirstBoot />

      <AdminOpsHealth />

      <AdminOpsIngest />

      <section className="mt-12">
        <h2 className="font-heading text-xl font-semibold tracking-[0.08em] uppercase">
          Server config
        </h2>
        <div className="gold-rule mt-2 max-w-[12rem]" />
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          Edit lobby / world / channel XML (and setup, constants, new character)
          with schema-driven fields; apply staged to live config and restart.
        </p>
        <p className="mt-3 text-sm">
          <Link
            href="/admin/config"
            className="underline underline-offset-2 hover:text-gold-dim"
          >
            Open server config editor
          </Link>
        </p>
      </section>

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

      <section className="mt-12">
        <h2 className="font-heading text-xl font-semibold tracking-[0.08em] uppercase">
          Portrait studio
        </h2>
        <div className="gold-rule mt-2 max-w-[12rem]" />
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          Dress online mannequins (vam / vaf) from a source character for
          armory portrait captures.
        </p>
        <p className="mt-3 text-sm">
          <Link
            href="/admin/studio"
            className="underline underline-offset-2 hover:text-gold-dim"
          >
            Open portrait studio
          </Link>
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-heading text-xl font-semibold tracking-[0.08em] uppercase">
          Account import
        </h2>
        <div className="gold-rule mt-2 max-w-[12rem]" />
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          Upload a vanilla COMP account export XML through the lobby import
          API (admin-gated).
        </p>
        <p className="mt-3 text-sm">
          <Link
            href="/admin/import"
            className="underline underline-offset-2 hover:text-gold-dim"
          >
            Open account import
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
