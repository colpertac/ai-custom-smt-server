"use client"

import { useMemo, useState } from "react"
import { MapPin, Sparkles, Users } from "lucide-react"

import { PublicEventDetailDialog } from "@/features/events/components/PublicEventDetailDialog"
import { EventZoneLabel } from "@/features/events/components/EventZoneLabel"
import {
  categoryBadgeClass,
  categoryIcon,
} from "@/features/events/lib/category-styles"
import type { CompEvent, PublicEventsResponse } from "@/lib/events/types"
import { cn } from "@/lib/utils"

function formatWhen(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function SectionHeading({
  eyebrow,
  title,
  count,
}: {
  eyebrow?: string
  title: string
  count?: number
}) {
  return (
    <div className="mb-4">
      {eyebrow ? (
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--gold-dim)]">
          {eyebrow}
        </p>
      ) : null}
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-heading text-xl font-semibold tracking-[0.1em] uppercase text-foreground sm:text-2xl">
          {title}
        </h2>
        {typeof count === "number" ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            {count}
          </span>
        ) : null}
      </div>
      <div className="gold-rule mt-2 max-w-[12rem]" />
    </div>
  )
}

function EventTile({
  event,
  featured = false,
  badge,
  onDetails,
}: {
  event: CompEvent
  featured?: boolean
  badge?: string
  onDetails: (event: CompEvent) => void
}) {
  const zones = (event.affectedZones ?? []).filter(Boolean)
  const spawnCount = event.npcSpawns?.length ?? 0
  const npcPreview = [
    ...new Set(
      spawnCount > 0
        ? (event.npcSpawns ?? []).map((s) => s.name)
        : event.featuredNpcs
    ),
  ].slice(0, 3)

  return (
    <button
      type="button"
      onClick={() => onDetails(event)}
      className={cn(
        "group site-panel relative w-full text-left transition duration-300 ease-out",
        "hover:border-[color-mix(in_srgb,var(--gold)_40%,var(--border))] hover:shadow-lg",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--gold)_55%,transparent)]",
        "motion-safe:hover:-translate-y-0.5",
        featured ? "p-5 sm:p-6" : "p-4"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            categoryBadgeClass(event.category)
          )}
        >
          {categoryIcon(event.category)}
          {event.category}
        </span>
        {badge ? (
          <span className="inline-flex items-center gap-1 rounded border border-[color-mix(in_srgb,var(--gold)_35%,transparent)] bg-[color-mix(in_srgb,var(--gold)_12%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--gold-hot)]">
            <span
              aria-hidden
              className="size-1.5 rounded-full bg-[var(--gold-hot)] motion-safe:animate-pulse"
            />
            {badge}
          </span>
        ) : null}
      </div>

      <h3
        className={cn(
          "font-heading mt-3 font-semibold tracking-[0.04em] text-foreground transition-colors group-hover:text-[var(--gold-hot)]",
          featured ? "text-xl sm:text-2xl" : "text-lg"
        )}
      >
        {event.titleEn}
      </h3>

      {event.summary ? (
        <p
          className={cn(
            "mt-2 text-muted-foreground leading-relaxed",
            featured ? "text-sm line-clamp-3" : "text-xs line-clamp-2"
          )}
        >
          {event.summary}
        </p>
      ) : null}

      {zones.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {zones.slice(0, featured ? 5 : 3).map((zone) => (
            <span
              key={zone}
              className="inline-flex items-center gap-1 rounded border border-border/50 bg-background/40 px-2 py-0.5 text-[10px] text-foreground/85"
            >
              <MapPin className="size-2.5 text-muted-foreground" aria-hidden />
              <EventZoneLabel label={zone} />
            </span>
          ))}
          {zones.length > (featured ? 5 : 3) ? (
            <span className="px-1 text-[10px] text-muted-foreground">
              +{zones.length - (featured ? 5 : 3)}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/50 pt-3">
        <p className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <Users className="size-3.5 shrink-0 text-[var(--gold-dim)]" aria-hidden />
          <span className="truncate">
            {npcPreview.length > 0
              ? npcPreview.join(" · ")
              : "Zones only — open for details"}
            {(spawnCount > npcPreview.length ||
              event.featuredNpcs.length > npcPreview.length) &&
            npcPreview.length > 0
              ? "…"
              : ""}
          </span>
        </p>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gold-dim)] transition-colors group-hover:text-[var(--gold-hot)]">
          Details →
        </span>
      </div>
    </button>
  )
}

export function PublicEventsSchedule({ data }: { data: PublicEventsResponse }) {
  const [selected, setSelected] = useState<CompEvent | null>(null)

  const alwaysIds = useMemo(
    () => new Set(data.alwaysOn.map((e) => e.id)),
    [data.alwaysOn]
  )
  const liveExclusive = useMemo(
    () => data.current.filter((e) => !alwaysIds.has(e.id)),
    [data.current, alwaysIds]
  )

  return (
    <div className="space-y-10">
      <header className="site-panel overflow-hidden p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-xl">
            <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--gold-dim)]">
              <Sparkles className="size-3" aria-hidden />
              Seasonal calendar
            </p>
            <p className="font-heading mt-2 text-2xl font-semibold tracking-[0.08em] uppercase sm:text-3xl">
              What&apos;s running
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {data.scheduleEnabled
                ? `Schedule is on (${data.mode} mode). Days flip at ${data.flipTime} ${data.timezone}.`
                : "Live seasonal events on this realm right now. Open any card for zones, NPCs, and map positions."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="rounded border border-border/70 bg-background/35 px-3 py-2 text-center min-w-[4.5rem]">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Live
              </p>
              <p className="font-heading mt-0.5 text-xl tabular-nums text-[var(--gold-hot)]">
                {data.current.length}
              </p>
            </div>
            <div className="rounded border border-border/70 bg-background/35 px-3 py-2 text-center min-w-[4.5rem]">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Always
              </p>
              <p className="font-heading mt-0.5 text-xl tabular-nums">
                {data.alwaysOn.length}
              </p>
            </div>
            {data.scheduleEnabled ? (
              <div className="rounded border border-border/70 bg-background/35 px-3 py-2 text-center min-w-[4.5rem]">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Upcoming
                </p>
                <p className="font-heading mt-0.5 text-xl tabular-nums">
                  {data.upcoming.length}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {data.alwaysOn.length > 0 ? (
        <section>
          <SectionHeading
            eyebrow="Standing"
            title="Always available"
            count={data.alwaysOn.length}
          />
          <div
            className={cn(
              "grid gap-3",
              data.alwaysOn.length > 1
                ? "sm:grid-cols-2"
                : "max-w-2xl"
            )}
          >
            {data.alwaysOn.map((e) => (
              <EventTile
                key={`always-${e.id}`}
                event={e}
                badge="Always on"
                onDetails={setSelected}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeading
          eyebrow="Right now"
          title="Now live"
          count={liveExclusive.length || data.current.length}
        />
        {(liveExclusive.length ? liveExclusive : data.current).length === 0 ? (
          <div className="site-panel px-5 py-8 text-sm text-muted-foreground">
            No seasonal events are live beyond the always-on set.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(liveExclusive.length ? liveExclusive : data.current).map(
              (e, i) => (
                <EventTile
                  key={e.id}
                  event={e}
                  featured={i === 0}
                  badge="Live"
                  onDetails={setSelected}
                />
              )
            )}
          </div>
        )}
      </section>

      {data.scheduleEnabled ? (
        <section>
          <SectionHeading
            eyebrow="Coming up"
            title="Upcoming"
            count={data.upcoming.length}
          />
          {data.upcoming.length === 0 ? (
            <div className="site-panel px-5 py-8 text-sm text-muted-foreground">
              No upcoming windows in the next two weeks.
            </div>
          ) : (
            <ul className="space-y-3">
              {data.upcoming.map((slot) => (
                <li key={`${slot.dayKey}-${slot.startsAt}`} className="site-panel p-4 sm:p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-xs font-medium text-[var(--gold-dim)]">
                      {formatWhen(slot.startsAt, data.timezone)}
                      <span className="text-muted-foreground"> → </span>
                      {formatWhen(slot.endsAt, data.timezone)}
                    </p>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {slot.events.length} event
                      {slot.events.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {slot.title ? (
                    <p className="font-heading mt-1 text-lg font-semibold tracking-wide">
                      {slot.title}
                    </p>
                  ) : null}
                  <ul className="mt-3 divide-y divide-border/40 overflow-hidden rounded border border-border/55 bg-background/30">
                    {slot.events.map((e) => (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(e)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--gold)_8%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--gold)_50%,transparent)]"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm text-foreground">
                              {e.titleEn}
                            </span>
                            <span
                              className={cn(
                                "mt-0.5 inline-flex items-center gap-1 rounded border px-1 py-px text-[9px] font-semibold uppercase tracking-wider",
                                categoryBadgeClass(e.category)
                              )}
                            >
                              {categoryIcon(e.category)}
                              {e.category}
                            </span>
                          </span>
                          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            Details →
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <PublicEventDetailDialog
        event={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
