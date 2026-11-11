"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"

import type { WikiItem } from "@/content/wiki"
import { WikiItemTable } from "@/features/wiki/components/WikiItemTable"
import {
  WIKI_PAGE_SIZE,
  WikiPagination,
} from "@/features/wiki/components/WikiPagination"
import { WikiPageHeader } from "@/features/wiki/components/WikiShell"
import { WikiSearch } from "@/features/wiki/components/WikiSearch"
import {
  filterWikiQuestHits,
  type WikiQuestSearchHit,
} from "@/lib/wiki-quest-search"

export function WikiSearchPanel({
  questIndex = [],
}: {
  questIndex?: WikiQuestSearchHit[]
}) {
  const searchParams = useSearchParams()
  const q = searchParams.get("q")?.trim() ?? ""
  const [page, setPage] = useState(0)
  const [items, setItems] = useState<WikiItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  const questHits = useMemo(
    () => filterWikiQuestHits(questIndex, q, 8),
    [questIndex, q]
  )

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
        description="Find items by name or ID, plus matching quests from the catalog."
      />

      <WikiSearch initialQuery={q} autoFocus />

      {!q ? (
        <div className="border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
          Enter a name or item ID above to search the full catalog.
        </div>
      ) : (
        <>
          {questHits.length > 0 ? (
            <section className="space-y-2">
              <h2 className="font-heading text-xs font-semibold tracking-[0.12em] uppercase text-gold-dim">
                Quests
              </h2>
              <ul className="border border-border divide-y divide-border">
                {questHits.map((hit) => (
                  <li key={hit.id}>
                    <Link
                      href={`/wiki/quests/${hit.id}`}
                      className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 no-underline hover:bg-muted/30"
                    >
                      <span className="font-mono text-xs text-muted-foreground">
                        #{hit.id}
                      </span>
                      <span className="text-sm text-gold-dim hover:text-gold-hot">
                        {hit.title}
                      </span>
                      <span className="font-mono text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                        {hit.type}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {hit.npc || hit.zoneLabel}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="text-[0.7rem] text-muted-foreground">
                Browse all in{" "}
                <Link
                  href="/wiki/quests"
                  className="text-gold-dim hover:text-gold-hot"
                >
                  Quests
                </Link>
                .
              </p>
            </section>
          ) : null}

          {total === 0 && !loading && questHits.length === 0 ? (
            <div className="border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
              No results for &quot;{q}&quot;. Try a shorter name or the exact
              item / quest ID.
            </div>
          ) : null}

          {q && (total > 0 || loading) ? (
            <>
              <p className="text-sm text-muted-foreground">
                {loading
                  ? "Searching items…"
                  : `${total.toLocaleString()} item match${total === 1 ? "" : "es"} for "${q}"`}
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
          ) : null}
        </>
      )}
    </div>
  )
}
