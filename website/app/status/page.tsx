import type { Metadata } from "next"

import { StatusPanel } from "@/features/status/components/StatusPanel"

export const metadata: Metadata = {
  title: "Status",
}

export default function StatusPage() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-heading text-3xl font-semibold tracking-[0.12em] uppercase">
        Server status
      </h1>
      <div className="gold-rule mt-3 max-w-xs" />
      <p className="mt-4 text-sm text-muted-foreground">
        Live probes from the website BFF. World stays internal and is not
        listed.
      </p>
      <StatusPanel />
    </section>
  )
}
