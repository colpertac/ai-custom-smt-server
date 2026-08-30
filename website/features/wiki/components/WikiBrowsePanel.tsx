"use client"

import { useEffect, useState } from "react"

import type { WikiItem, WikiItemCategory } from "@/content/wiki"
import { wikiArmorSlots } from "@/content/wiki"
import { WikiItemTable } from "@/features/wiki/components/WikiItemTable"
import {
  WIKI_PAGE_SIZE,
  WikiPagination,
} from "@/features/wiki/components/WikiPagination"
import { WikiPageHeader } from "@/features/wiki/components/WikiShell"
import { WIKI_CATEGORY_META } from "@/features/wiki/wiki-nav"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export function WikiBrowsePanel({
  category,
  totalCount,
}: {
  category: WikiItemCategory
  totalCount: number
}) {
  const meta = WIKI_CATEGORY_META[category]
  const [query, setQuery] = useState("")
  const [slot, setSlot] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [items, setItems] = useState<WikiItem[]>([])
  const [total, setTotal] = useState(totalCount)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setPage(0)
  }, [query, slot, category])

  useEffect(() => {
    let cancelled = false
    const handle = window.setTimeout(() => {
      setLoading(true)
      const params = new URLSearchParams({
        category,
        limit: String(WIKI_PAGE_SIZE),
        offset: String(page * WIKI_PAGE_SIZE),
      })
      const q = query.trim()
      if (q) params.set("q", q)
      if (slot) params.set("slot", slot)

      fetch(`/api/wiki/browse?${params.toString()}`)
        .then((res) => res.json())
        .then((data: { total: number; items: WikiItem[] }) => {
          if (cancelled) return
          setTotal(data.total)
          setItems(data.items)
          setLoading(false)
        })
        .catch(() => {
          if (!cancelled) setLoading(false)
        })
    }, query.trim() ? 200 : 0)

    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [category, query, slot, page])

  return (
    <div className="space-y-6">
      <WikiPageHeader
        title={meta.title}
        description={`${meta.blurb} ${totalCount.toLocaleString()} entries in this category.`}
      />

      <div className="grid gap-4 border border-border bg-card/40 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field>
          <FieldLabel htmlFor={`wiki-filter-${category}`}>
            Filter this category
          </FieldLabel>
          <Input
            id={`wiki-filter-${category}`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or item ID…"
            autoComplete="off"
          />
        </Field>
        <p className="text-xs text-muted-foreground sm:pb-2">
          {loading
            ? "Loading…"
            : query.trim() || slot
              ? `${total.toLocaleString()} match${total === 1 ? "" : "es"}`
              : `${total.toLocaleString()} in category`}
        </p>
      </div>

      {category === "armor" && wikiArmorSlots.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <SlotChip
            label="All slots"
            active={!slot}
            onClick={() => setSlot(null)}
          />
          {wikiArmorSlots.map((s) => (
            <SlotChip
              key={s}
              label={s}
              active={slot === s}
              onClick={() => setSlot(slot === s ? null : s)}
            />
          ))}
        </div>
      ) : null}

      <WikiPagination
        page={page}
        total={total}
        loading={loading}
        onPageChange={setPage}
      />

      {items.length === 0 && !loading ? (
        <div className="border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
          No entries match. Try another name, ID, or slot filter.
        </div>
      ) : (
        <WikiItemTable items={items} category={category} />
      )}

      <WikiPagination
        page={page}
        total={total}
        loading={loading}
        onPageChange={setPage}
      />
    </div>
  )
}

function SlotChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant={active ? "default" : "outline"}
      className={cn("uppercase tracking-wider", !active && "text-muted-foreground")}
      onClick={onClick}
    >
      {label}
    </Button>
  )
}
