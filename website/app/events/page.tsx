import type { Metadata } from "next"
import { Suspense } from "react"

import { EventsHub } from "@/features/events/components/EventsHub"
import { getPublicEventsResponse } from "@/lib/events/event-schedule-fs"
import { listPublicPayouts } from "@/lib/public-payouts"

export const metadata: Metadata = {
  title: "Events",
}

export const dynamic = "force-dynamic"

export default async function EventsPage() {
  const [events, payouts] = await Promise.all([
    getPublicEventsResponse(),
    listPublicPayouts(),
  ])

  return (
    <Suspense
      fallback={
        <section className="mx-auto max-w-2xl px-4 py-10">
          <h1 className="font-heading text-3xl font-semibold tracking-[0.12em] uppercase">
            Events
          </h1>
          <div className="gold-rule mt-3 max-w-xs" />
          <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
        </section>
      }
    >
      <EventsHub events={events} payouts={payouts} />
    </Suspense>
  )
}
