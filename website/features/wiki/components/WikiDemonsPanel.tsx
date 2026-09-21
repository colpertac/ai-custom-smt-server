"use client"

import { useMemo, useState } from "react"

import type { DevilCatalogEntry } from "@/lib/armory-catalogs"
import {
  WIKI_PAGE_SIZE,
  WikiPagination,
} from "@/features/wiki/components/WikiPagination"
import { WikiPageHeader } from "@/features/wiki/components/WikiShell"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

function filterDevils(
  all: DevilCatalogEntry[],
  query: string
): DevilCatalogEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return all
  return all.filter((d) => {
    const idStr = String(d.id)
    if (idStr === q || idStr.startsWith(q)) return true
    return d.name.toLowerCase().includes(q)
  })
}

export function WikiDemonsPanel({
  demons,
}: {
  demons: DevilCatalogEntry[]
}) {
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)

  const filtered = useMemo(
    () => filterDevils(demons, query),
    [demons, query]
  )

  const total = filtered.length
  const pageCount = Math.max(1, Math.ceil(total / WIKI_PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const slice = filtered.slice(
    safePage * WIKI_PAGE_SIZE,
    (safePage + 1) * WIKI_PAGE_SIZE
  )

  const setQueryAndReset = (value: string) => {
    setQuery(value)
    setPage(0)
  }

  const filteredActive = Boolean(query.trim())

  return (
    <div className="space-y-6">
      <WikiPageHeader
        title="Demons"
        description={`${demons.length.toLocaleString()} DevilData entries. Use the ID with the GM command @contract — e.g. @contract 105 or @contract Phoenix. Prefer IDs when names collide.`}
      />

      <div className="grid gap-4 border border-border bg-card/40 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field>
          <FieldLabel htmlFor="wiki-filter-demons">Filter demons</FieldLabel>
          <Input
            id="wiki-filter-demons"
            value={query}
            onChange={(e) => setQueryAndReset(e.target.value)}
            placeholder="Name or demon ID…"
            autoComplete="off"
            autoFocus
          />
        </Field>
        <p className="text-xs text-muted-foreground sm:pb-2">
          {filteredActive
            ? `${total.toLocaleString()} match${total === 1 ? "" : "es"}`
            : `${total.toLocaleString()} demons`}
        </p>
      </div>

      <WikiPagination
        page={safePage}
        total={total}
        onPageChange={setPage}
      />

      {slice.length === 0 ? (
        <div className="border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
          No demons match. Try another name or ID.
        </div>
      ) : (
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[20rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">Name</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((d) => (
                <tr
                  key={d.id}
                  className="border-b border-border/80 transition-colors hover:bg-muted/30"
                >
                  <td className="px-3 py-2 font-mono tabular-nums text-foreground">
                    {d.id}
                  </td>
                  <td className="px-3 py-2 text-foreground">{d.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <WikiPagination
        page={safePage}
        total={total}
        onPageChange={setPage}
      />
    </div>
  )
}
