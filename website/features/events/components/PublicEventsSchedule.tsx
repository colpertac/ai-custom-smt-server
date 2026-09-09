import type { PublicEventsResponse } from "@/lib/events/types"

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

export function PublicEventsSchedule({ data }: { data: PublicEventsResponse }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">
        {data.scheduleEnabled
          ? `Seasonal events (${data.mode} mode, flip ${data.flipTime} ${data.timezone}).`
          : "Currently active seasonal event partials on this realm."}
      </p>

      {data.alwaysOn.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Always available
          </h2>
          <ul className="mt-3 space-y-2">
            {data.alwaysOn.map((e) => (
              <li
                key={`always-${e.id}`}
                className="border border-border bg-muted/40 p-3"
              >
                <p className="font-heading text-base font-semibold tracking-wide">
                  {e.titleEn}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{e.summary}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Now live
        </h2>
        {data.current.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No seasonal events active right now.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {data.current.map((e) => (
              <li key={e.id} className="border border-border bg-muted/40 p-4">
                <p className="text-[10px] uppercase tracking-wide text-primary">
                  {e.category}
                </p>
                <h3 className="font-heading mt-1 text-xl font-semibold tracking-wide">
                  {e.titleEn}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">{e.summary}</p>
                {e.affectedZones.length > 0 && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Zones: {e.affectedZones.slice(0, 4).join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {data.scheduleEnabled && (
        <div className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Upcoming
          </h2>
          {data.upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No upcoming windows in the next two weeks.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {data.upcoming.map((slot) => (
                <li
                  key={`${slot.dayKey}-${slot.startsAt}`}
                  className="border border-border/80 bg-muted/30 p-4"
                >
                  <p className="text-xs text-muted-foreground">
                    {formatWhen(slot.startsAt, data.timezone)} →{" "}
                    {formatWhen(slot.endsAt, data.timezone)}
                  </p>
                  {slot.title && (
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {slot.title}
                    </p>
                  )}
                  <ul className="mt-2 space-y-1">
                    {slot.events.map((e) => (
                      <li key={e.id} className="text-sm text-foreground/90">
                        {e.titleEn}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
