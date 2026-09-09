"use client"

import { useRouter, useSearchParams } from "next/navigation"

import { PublicEventsSchedule } from "@/features/events/components/PublicEventsSchedule"
import { PublicPayoutsSheet } from "@/features/payouts/components/PublicPayoutsSheet"
import type { PublicEventsResponse } from "@/lib/events/types"
import type { PublicPayoutRow } from "@/lib/public-payout-types"
import { cn } from "@/lib/utils"

type TabId = "events" | "payouts"

function parseTab(raw: string | null): TabId {
  if (raw === "payouts") return "payouts"
  // legacy ?tab=schedule from the first hub ship
  return "events"
}

const VIEWS: { id: TabId; label: string }[] = [
  { id: "events", label: "Events" },
  { id: "payouts", label: "Payouts" },
]

export function EventsHub({
  events,
  payouts,
}: {
  events: PublicEventsResponse
  payouts: PublicPayoutRow[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = parseTab(searchParams.get("tab"))

  function setTab(id: TabId) {
    const params = new URLSearchParams(searchParams.toString())
    if (id === "events") params.delete("tab")
    else params.set("tab", id)
    const q = params.toString()
    router.replace(q ? `/events?${q}` : "/events", { scroll: false })
  }

  return (
    <section
      className={cn(
        "mx-auto max-w-5xl px-4 py-10",
        tab === "payouts" && "site-atmosphere"
      )}
    >
      <div
        role="tablist"
        aria-label="Events views"
        className="flex flex-wrap items-baseline gap-x-4 gap-y-2 sm:gap-x-6"
      >
        {VIEWS.map((view) => {
          const selected = view.id === tab
          return (
            <button
              key={view.id}
              type="button"
              role="tab"
              aria-selected={selected}
              id={`events-tab-${view.id}`}
              aria-controls={`events-panel-${view.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(view.id)}
              className={cn(
                "relative font-heading text-3xl font-semibold tracking-[0.12em] uppercase transition-colors duration-300 ease-out",
                "pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50",
                selected
                  ? "text-accent-foreground"
                  : "text-muted-foreground/45 hover:text-muted-foreground"
              )}
            >
              {view.label}
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-gold to-transparent transition-opacity duration-300",
                  selected ? "opacity-100" : "opacity-0"
                )}
              />
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`events-panel-${tab}`}
        aria-labelledby={`events-tab-${tab}`}
        key={tab}
        className="mt-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"
      >
        {tab === "events" ? (
          <div className="max-w-2xl">
            <PublicEventsSchedule data={events} />
          </div>
        ) : (
          <>
            <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
              Switch between CP and Magical Golden Apples (Golden Light). Click a
              family with a chevron to expand variants. Boss-crate item drops are
              configured separately.
            </p>
            <PublicPayoutsSheet rows={payouts} />
          </>
        )}
      </div>
    </section>
  )
}
