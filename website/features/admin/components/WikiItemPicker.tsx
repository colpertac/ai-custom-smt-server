"use client"

import { useEffect, useState } from "react"

import type { WikiItem } from "@/content/wiki"
import { WikiItemIcon } from "@/features/wiki/components/WikiItemIcon"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type WikiBrowseResponse = {
  items?: WikiItem[]
}

/**
 * Compact catalog picker (gear-builder / wiki browse pattern).
 * Debounced GET /api/wiki/browse → icon + name + #id list.
 */
export function WikiItemPicker({
  onSelect,
  category = "all",
  className,
}: {
  onSelect: (item: WikiItem) => void
  category?: "all" | "weapons" | "armor" | "items"
  className?: string
}) {
  const [q, setQ] = useState("")
  const [items, setItems] = useState<WikiItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams()
    params.set("category", category)
    params.set("limit", "40")
    if (q.trim()) params.set("q", q.trim())

    const handle = window.setTimeout(() => {
      setLoading(true)
      fetch(`/api/wiki/browse?${params}`)
        .then((r) => r.json())
        .then((data: WikiBrowseResponse) => {
          if (cancelled) return
          setItems(data.items ?? [])
          setLoading(false)
        })
        .catch(() => {
          if (!cancelled) setLoading(false)
        })
    }, q.trim() ? 200 : 0)

    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [q, category])

  return (
    <div className={cn("flex min-h-0 flex-col gap-2", className)}>
      <Input
        placeholder="Search items by name or ID…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="h-8 text-xs"
      />
      <div className="min-h-0 max-h-56 flex-1 overflow-y-auto border border-border">
        {loading ? (
          <p className="p-2 text-[11px] text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="p-2 text-[11px] text-muted-foreground">No items.</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/50"
                  onClick={() => onSelect(item)}
                >
                  <WikiItemIcon item={item} size={28} />
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {item.name}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    #{item.id}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
