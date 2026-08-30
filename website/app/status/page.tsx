import type { Metadata } from "next"

import { StatusPanel } from "@/features/status/components/StatusPanel"

export const metadata: Metadata = {
  title: "Status",
  description: "See whether SMT game servers are online or if connection trouble is likely on your side.",
}

export default function StatusPage() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-heading text-3xl font-semibold tracking-[0.12em] uppercase">
        Server status
      </h1>
      <div className="gold-rule mt-3 max-w-xs" />
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Quick check before you blame your internet: are the game servers up, or
        is it just your connection or client?
      </p>
      <StatusPanel />
    </section>
  )
}
