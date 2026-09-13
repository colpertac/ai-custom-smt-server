"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import { isAdminLevel } from "@/lib/admin-level"
import {
  getAccessibleGmCommands,
  getNextLockedGmTier,
  getUnlockedGmTierLabel,
  type GmCommand,
} from "@/lib/server-config/gm-commands"

function matchesQuery(cmd: GmCommand, q: string): boolean {
  if (!q) return true
  const hay = [
    cmd.name,
    ...(cmd.aliases ?? []),
    cmd.usage,
    cmd.description,
    cmd.category,
  ]
    .join(" ")
    .toLowerCase()
  return hay.includes(q)
}

export function AccountGmCommands({ userLevel }: { userLevel: number }) {
  const [query, setQuery] = useState("")
  const accessible = useMemo(
    () => getAccessibleGmCommands(userLevel),
    [userLevel]
  )
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return accessible.filter((cmd) => matchesQuery(cmd, q))
  }, [accessible, query])
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

  const tierLabel = getUnlockedGmTierLabel(userLevel)
  const nextTier = getNextLockedGmTier(userLevel)
  const showSearch = accessible.length > 8

  return (
    <section className="border border-border bg-card/60 px-5 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-sm tracking-[0.15em] text-gold uppercase">
            GM commands
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Chat commands at GM level {userLevel} ({tierLabel}). Type{" "}
            <span className="font-mono text-foreground/80">@…</span> in channel
            chat. Higher levels unlock every lower tier.
          </p>
        </div>
        {isAdminLevel(userLevel) ? (
          <Link
            href="/admin/commands-info"
            className="shrink-0 text-[11px] text-gold underline-offset-2 hover:underline"
          >
            Full catalog
          </Link>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {showSearch ? (
          <div className="relative min-w-56 flex-1">
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
              aria-label="Search your GM commands"
            />
          </div>
        ) : null}
        <p className="text-[11px] text-muted-foreground">
          {filtered.length} command{filtered.length === 1 ? "" : "s"}
          {query ? " matching" : " available"}
          {nextTier
            ? ` · next unlock at ${nextTier.level} (${nextTier.label})`
            : ""}
        </p>
      </div>

      {grouped.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No commands match your search.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          {grouped.map(([level, group]) => (
            <section key={level} className="space-y-2">
              <header className="flex items-baseline gap-2 border-b border-border/60 pb-1.5">
                <h3 className="font-mono text-xs font-semibold text-gold-dim">
                  ≥{level}
                </h3>
                <span className="text-[11px] text-muted-foreground">
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
                      <th className="w-32 px-2.5 py-1.5 font-semibold">
                        Command
                      </th>
                      <th className="min-w-36 px-2.5 py-1.5 font-semibold">
                        Usage
                      </th>
                      <th className="px-2.5 py-1.5 font-semibold">
                        Description
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.commands.map((cmd, i) => (
                      <tr
                        key={cmd.name}
                        className={
                          i % 2 === 0
                            ? "border-b border-border/40 bg-background align-top"
                            : "border-b border-border/40 bg-muted/20 align-top"
                        }
                      >
                        <td className="px-2.5 py-1.5 align-top">
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
                        <td className="px-2.5 py-1.5 align-top">
                          <code className="block whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-gold-dim">
                            {cmd.usage}
                          </code>
                        </td>
                        <td className="px-2.5 py-1.5 align-top leading-relaxed text-muted-foreground">
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
    </section>
  )
}
