"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import type { WikiValuable } from "@/content/wiki/types"
import {
  WIKI_PAGE_SIZE,
  WikiPagination,
} from "@/features/wiki/components/WikiPagination"
import { WikiPageHeader } from "@/features/wiki/components/WikiShell"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type VisibilityFilter = "all" | "visible" | "hidden"

function matchesQuery(valuable: WikiValuable, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const idStr = String(valuable.id)
  if (idStr === q || idStr.startsWith(q)) return true
  if (valuable.name.toLowerCase().includes(q)) return true
  if (valuable.description.toLowerCase().includes(q)) return true
  return false
}

export function WikiValuablesPanel({
  valuables,
}: {
  valuables: WikiValuable[]
}) {
  const [query, setQuery] = useState("")
  const [visibility, setVisibility] = useState<VisibilityFilter>("all")
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    return valuables.filter((v) => {
      if (visibility === "visible" && v.hidden) return false
      if (visibility === "hidden" && !v.hidden) return false
      return matchesQuery(v, query)
    })
  }, [valuables, query, visibility])

  const total = filtered.length
  const safePage = Math.min(
    page,
    Math.max(0, Math.ceil(total / WIKI_PAGE_SIZE) - 1)
  )
  const slice = filtered.slice(
    safePage * WIKI_PAGE_SIZE,
    (safePage + 1) * WIKI_PAGE_SIZE
  )

  return (
    <div className="space-y-6">
      <WikiPageHeader
        title="Valuables"
        description={`${valuables.length.toLocaleString()} CValuablesData entries. Use the ID with @valuable (e.g. @valuable 15 for Class C DB License). Add remove as a second argument to take it away.`}
      />

      <div className="grid gap-4 border border-border bg-card/40 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field className="sm:col-span-2 lg:col-span-2">
          <FieldLabel htmlFor="wiki-filter-valuables">
            Filter valuables
          </FieldLabel>
          <Input
            id="wiki-filter-valuables"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
            placeholder="Name, description, or valuable ID…"
            autoComplete="off"
            autoFocus
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="wiki-filter-valuable-visibility">
            Visibility
          </FieldLabel>
          <select
            id="wiki-filter-valuable-visibility"
            className="flex h-9 w-full rounded-none border border-border bg-background px-2 text-sm"
            value={visibility}
            onChange={(e) => {
              setVisibility(e.target.value as VisibilityFilter)
              setPage(0)
            }}
          >
            <option value="all">All</option>
            <option value="visible">Player-facing</option>
            <option value="hidden">Hidden / flags</option>
          </select>
        </Field>
      </div>

      <p className="text-sm text-muted-foreground">
        Showing {total.toLocaleString()}
        {query.trim() || visibility !== "all" ? " matching" : ""} valuables
      </p>

      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 font-medium">ID</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 font-medium">Flags</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((valuable) => (
              <tr
                key={valuable.id}
                className="border-b border-border/70 hover:bg-muted/30"
              >
                <td className="px-3 py-2 align-top font-mono text-xs text-muted-foreground">
                  {valuable.id}
                </td>
                <td className="px-3 py-2 align-top">
                  <Link
                    href={`/wiki/valuables/${valuable.id}`}
                    className="font-medium text-foreground no-underline hover:text-gold-hot"
                  >
                    {valuable.name || `Valuable ${valuable.id}`}
                  </Link>
                </td>
                <td className="max-w-md px-3 py-2 align-top text-muted-foreground">
                  <span className="line-clamp-2">
                    {valuable.description || "—"}
                  </span>
                </td>
                <td className="px-3 py-2 align-top">
                  {valuable.hidden ? (
                    <span
                      className={cn(
                        "text-xs uppercase tracking-wide text-amber-400/90"
                      )}
                    >
                      Hidden
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
            {slice.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No valuables match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <WikiPagination
        page={safePage}
        total={total}
        onPageChange={setPage}
      />
    </div>
  )
}
