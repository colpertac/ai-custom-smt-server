"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"

import type { WikiItem } from "@/content/wiki"
import { WikiItemTable } from "@/features/wiki/components/WikiItemTable"
import {
  WIKI_PAGE_SIZE,
  WikiPagination,
} from "@/features/wiki/components/WikiPagination"
import { WikiPageHeader } from "@/features/wiki/components/WikiShell"
import { WikiSearch } from "@/features/wiki/components/WikiSearch"

export function WikiSearchPanel() {
  const searchParams = useSearchParams()
  const q = searchParams.get("q")?.trim() ?? ""
  const [page, setPage] = useState(0)
  const [items, setItems] = useState<WikiItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setPage(0)
  }, [q])

  useEffect(() => {
    if (!q) {
      setItems([])
      setTotal(0)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams({
      category: "all",
      limit: String(WIKI_PAGE_SIZE),
      offset: String(page * WIKI_PAGE_SIZE),
      q,
    })

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

    return () => {
      cancelled = true
    }
  }, [q, page])

  return (
    <div className="space-y-4">
      <WikiPageHeader
        title="Search"
        description="Find any item by name or numeric ID across weapons, armor, and consumables."
      />

      <WikiSearch initialQuery={q} autoFocus />

      {!q ? (
        <div className="border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
          Enter a name or item ID above to search the full catalog.
        </div>
      ) : total === 0 && !loading ? (
        <div className="border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
          No results for &quot;{q}&quot;. Try a shorter name or the exact item
          ID.
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Searching…"
              : `${total.toLocaleString()} match${total === 1 ? "" : "es"} for "${q}"`}
          </p>

          <WikiPagination
            page={page}
            total={total}
            loading={loading}
            onPageChange={setPage}
          />

          <WikiItemTable items={items} showCategory />

          <WikiPagination
            page={page}
            total={total}
            loading={loading}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  )
}
