"use client"

import { useServerStatus } from "@/features/status/hooks"
import type { ProbeState } from "@/lib/status"

function stateClass(state: ProbeState): string {
  if (state === "up") return "text-emerald-400"
  if (state === "down") return "text-red-400"
  return "text-muted-foreground"
}

export function StatusPanel() {
  const { data, isLoading, isError, error } = useServerStatus()

  if (isLoading) {
    return (
      <p className="mt-8 text-sm text-muted-foreground">Checking services…</p>
    )
  }

  if (isError) {
    return (
      <p className="mt-8 text-sm font-medium text-[#ff9b9b]">
        {error instanceof Error ? error.message : "Status probe failed"}
      </p>
    )
  }

  const services = data?.services ?? []

  return (
    <ul className="mt-8 divide-y divide-border border border-border bg-muted/40">
      {services.map((s) => (
        <li
          key={s.id}
          className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm"
        >
          <span className="font-medium text-foreground">{s.label}</span>
          <span className={stateClass(s.state)}>
            {s.state.toUpperCase()}
            {s.detail ? (
              <span className="ml-2 font-normal text-muted-foreground">
                {s.detail}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  )
}
