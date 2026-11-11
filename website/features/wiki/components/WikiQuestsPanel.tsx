"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import {
  WIKI_PAGE_SIZE,
  WikiPagination,
} from "@/features/wiki/components/WikiPagination"
import { WikiPageHeader } from "@/features/wiki/components/WikiShell"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { WikiQuestRow } from "@/lib/wiki-quest-guide"

const TYPE_ORDER = [
  "NORMAL",
  "REPEATABLE",
  "EPISODE",
  "EVENT",
  "ITIME",
  "INACTIVE",
] as const

const selectClass =
  "flex h-9 w-full rounded-none border border-border bg-background px-2 text-sm"

function matchesQuery(quest: WikiQuestRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const idStr = String(quest.id)
  if (idStr === q || idStr.startsWith(q)) return true
  if ((quest.title ?? "").toLowerCase().includes(q)) return true
  if (quest.npc?.toLowerCase().includes(q)) return true
  if (quest.zone.toLowerCase().includes(q)) return true
  return false
}

export function WikiQuestsPanel({ quests }: { quests: WikiQuestRow[] }) {
  const [query, setQuery] = useState("")
  const [type, setType] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  const types = useMemo(() => {
    const set = new Set<string>()
    for (const q of quests) {
      if (q.type) set.add(q.type)
    }
    return [...set].sort((a, b) => {
      const ia = TYPE_ORDER.indexOf(a as (typeof TYPE_ORDER)[number])
      const ib = TYPE_ORDER.indexOf(b as (typeof TYPE_ORDER)[number])
      if (ia !== -1 || ib !== -1) {
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
      }
      return a.localeCompare(b)
    })
  }, [quests])

  const filtered = useMemo(() => {
    return quests
      .filter((q) => {
        if (!matchesQuery(q, query)) return false
        if (type && q.type !== type) return false
        return true
      })
      .sort((a, b) => a.id - b.id)
  }, [quests, query, type])

  const total = filtered.length
  const pageCount = Math.max(1, Math.ceil(total / WIKI_PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const slice = filtered.slice(
    safePage * WIKI_PAGE_SIZE,
    (safePage + 1) * WIKI_PAGE_SIZE
  )

  const resetPage = () => setPage(0)
  const filtersActive = Boolean(query.trim() || type)

  return (
    <div className="space-y-6">
      <WikiPageHeader
        title="Quests"
        description={`${quests.length.toLocaleString()} quests from QuestData / CQuestData. Quests marked “guide” have a step-by-step walkthrough (NPCs, dialogue choices, fights, rewards) built from the server's event scripts.`}
      />

      <aside className="border-l-2 border-gold-dim bg-muted/20 px-4 py-3 text-sm leading-relaxed">
        <p className="font-medium text-foreground">
          These guides are generated automatically.
        </p>
        <p className="mt-1 text-muted-foreground">
          Walkthroughs are read straight out of the server&apos;s quest scripts
          and game text — no one has written or play-tested them. They tell you
          who to talk to, what to pick, and what you get, but not the tips,
          strategy, or gotchas a hand-written guide would have. Map coordinates
          can be off by a square, and some steps may be missing or oddly worded.
          Spotted something wrong?{" "}
          <Link
            href="/feedback"
            className="text-gold-dim no-underline hover:text-gold-hot"
          >
            Send feedback
          </Link>
          .
        </p>
      </aside>

      <div className="grid gap-4 border border-border bg-card/40 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field className="sm:col-span-2 lg:col-span-2">
          <FieldLabel htmlFor="wiki-filter-quests">Filter quests</FieldLabel>
          <Input
            id="wiki-filter-quests"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              resetPage()
            }}
            placeholder="Title, NPC, zone, or quest ID…"
            autoComplete="off"
            autoFocus
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="wiki-filter-quest-type">Type</FieldLabel>
          <select
            id="wiki-filter-quest-type"
            className={selectClass}
            value={type ?? ""}
            onChange={(e) => {
              setType(e.target.value || null)
              resetPage()
            }}
          >
            <option value="">Any type</option>
            {types.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>

        <p className="self-end pb-1 text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
          {filtersActive
            ? `${total.toLocaleString()} match${total === 1 ? "" : "es"}`
            : `${total.toLocaleString()} quests`}
        </p>
      </div>

      <WikiPagination page={safePage} total={total} onPageChange={setPage} />

      {slice.length === 0 ? (
        <div className="border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
          No quests match. Try another title, NPC, type, or ID.
        </div>
      ) : (
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs tracking-wider text-muted-foreground uppercase">
                <th className="px-2 py-2 font-medium">ID</th>
                <th className="px-2 py-2 font-medium">Title</th>
                <th className="px-2 py-2 font-medium">Type</th>
                <th className="px-2 py-2 font-medium">NPC</th>
                <th className="px-2 py-2 font-medium">Zone</th>
                <th className="px-2 py-2 font-medium">Lv</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((q) => (
                <tr
                  key={q.id}
                  className="border-b border-border/80 transition-colors hover:bg-muted/30"
                >
                  <td className="px-2 py-1.5 font-mono text-foreground tabular-nums">
                    <Link
                      href={`/wiki/quests/${q.id}`}
                      className="no-underline hover:text-gold-hot"
                    >
                      {q.id}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 text-foreground">
                    <Link
                      href={`/wiki/quests/${q.id}`}
                      className="no-underline hover:text-gold-hot"
                    >
                      {q.title}
                    </Link>
                    {q.hasGuide ? (
                      <span className="ml-1.5 border border-gold-dim/50 px-1 font-mono text-[0.6rem] tracking-wide text-gold-dim uppercase">
                        guide
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <span
                      className={cn(
                        "font-mono text-[0.7rem] tracking-wide uppercase",
                        q.type === "INACTIVE"
                          ? "text-muted-foreground"
                          : "text-foreground"
                      )}
                    >
                      {q.type}
                    </span>
                  </td>
                  <td className="max-w-[12rem] truncate px-2 py-1.5 text-muted-foreground">
                    {q.npc || "—"}
                  </td>
                  <td
                    className="max-w-[14rem] truncate px-2 py-1.5 text-muted-foreground"
                    title={q.zone}
                  >
                    {q.zone}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-muted-foreground tabular-nums">
                    {q.levelMin ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <WikiPagination page={safePage} total={total} onPageChange={setPage} />
    </div>
  )
}
