"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import {
  GM_COMMANDS,
  type GmCommand,
} from "@/lib/server-config/gm-commands"

const LEVEL_FILTERS = [
  { id: "all", label: "All" },
  { id: "0", label: "=0", level: 0 },
  { id: "1", label: "=1", level: 1 },
  { id: "100", label: "=100", level: 100 },
  { id: "200", label: "=200", level: 200 },
  { id: "250", label: "=250", level: 250 },
  { id: "400", label: "=400", level: 400 },
  { id: "650+", label: "≥650", minLevel: 650 },
] as const

function matchesQuery(cmd: GmCommand, q: string): boolean {
  if (!q) return true
  const hay = [
    cmd.name,
    ...(cmd.aliases ?? []),
    cmd.usage,
    cmd.description,
    cmd.category,
    String(cmd.level),
  ]
    .join(" ")
    .toLowerCase()
  return hay.includes(q)
}

function passesLevelFilter(
  cmd: GmCommand,
  filterId: (typeof LEVEL_FILTERS)[number]["id"]
): boolean {
  if (filterId === "all") return true
  if (filterId === "650+") return cmd.level >= 650
  return cmd.level === Number(filterId)
}

export function GmCommandsInfoPanel() {
  const [query, setQuery] = useState("")
  const [levelFilter, setLevelFilter] =
    useState<(typeof LEVEL_FILTERS)[number]["id"]>("all")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return GM_COMMANDS.filter(
      (cmd) => passesLevelFilter(cmd, levelFilter) && matchesQuery(cmd, q)
    )
  }, [query, levelFilter])

  const grouped = useMemo(() => {
    const map = new Map<number, { category: string; commands: GmCommand[] }>()
    for (const cmd of filtered) {
      let group = map.get(cmd.level)
      if (!group) {
        group = { category: cmd.category, commands: [] }
        map.set(cmd.level, group)
      }
      group.commands.push(cmd)
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [filtered])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search command, usage, or description…"
            className="pl-8"
            aria-label="Search GM commands"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          {filtered.length} command{filtered.length === 1 ? "" : "s"}
          {query || levelFilter !== "all" ? " matching" : ""} · thresholds from{" "}
          <Link
            href="/admin/config"
            className="text-foreground underline-offset-2 hover:underline"
          >
            constants.xml
          </Link>
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {LEVEL_FILTERS.map((f) => {
          const active = levelFilter === f.id
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setLevelFilter(f.id)}
              className={
                active
                  ? "border border-gold-dim bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground"
                  : "border border-border/70 bg-transparent px-2.5 py-1 text-[11px] text-muted-foreground hover:border-border hover:text-foreground"
              }
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {grouped.length === 0 ? (
        <p className="border border-border/60 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
          No commands match your search.
        </p>
      ) : (
        <div className="space-y-6">
          {grouped.map(([level, group]) => (
            <section key={level} className="space-y-2">
              <header className="flex items-baseline gap-2 border-b border-border/60 pb-1.5">
                <h2 className="font-mono text-sm font-semibold text-gold-dim">
                  ≥{level}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {group.category}
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground/80">
                  {group.commands.length} cmd
                  {group.commands.length === 1 ? "" : "s"}
                </span>
              </header>

              <div className="overflow-auto border border-border/80">
                <table className="w-full border-collapse text-left text-[11px]">
                  <thead className="bg-muted/60">
                    <tr className="border-b border-border/80">
                      <th className="w-36 px-3 py-2 font-semibold">Command</th>
                      <th className="min-w-44 px-3 py-2 font-semibold">
                        Usage
                      </th>
                      <th className="px-3 py-2 font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.commands.map((cmd, i) => (
                      <tr
                        key={cmd.name}
                        id={`cmd-${cmd.name}`}
                        className={
                          i % 2 === 0
                            ? "scroll-mt-20 border-b border-border/40 bg-background align-top"
                            : "scroll-mt-20 border-b border-border/40 bg-muted/20 align-top"
                        }
                      >
                        <td className="px-3 py-2.5 align-top">
                          <div className="font-mono text-xs font-semibold text-foreground">
                            @{cmd.name}
                          </div>
                          {cmd.aliases?.length ? (
                            <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                              alias{" "}
                              {cmd.aliases.map((a) => `@${a}`).join(", ")}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <code className="block whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-gold-dim">
                            {cmd.usage}
                          </code>
                        </td>
                        <td className="px-3 py-2.5 align-top leading-relaxed text-muted-foreground">
                          {cmd.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
