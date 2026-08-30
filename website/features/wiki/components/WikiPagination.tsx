"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export const WIKI_PAGE_SIZE = 100

export function wikiPageCount(total: number, pageSize = WIKI_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize))
}

function clampPage(page: number, pages: number): number {
  return Math.min(Math.max(0, page), pages - 1)
}

export function WikiPagination({
  page,
  total,
  pageSize = WIKI_PAGE_SIZE,
  onPageChange,
  loading = false,
  className,
}: {
  page: number
  total: number
  pageSize?: number
  onPageChange: (page: number) => void
  loading?: boolean
  className?: string
}) {
  const pages = wikiPageCount(total, pageSize)
  const start = total === 0 ? 0 : page * pageSize + 1
  const end = Math.min(total, (page + 1) * pageSize)
  const canPrev = page > 0
  const canNext = page + 1 < pages
  const [pageInput, setPageInput] = useState(String(page + 1))

  useEffect(() => {
    setPageInput(String(page + 1))
  }, [page])

  if (total <= pageSize) return null

  const goToPage = () => {
    const parsed = Number.parseInt(pageInput.trim(), 10)
    if (!Number.isFinite(parsed)) {
      setPageInput(String(page + 1))
      return
    }
    onPageChange(clampPage(parsed - 1, pages))
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border border-border bg-card/40 px-3 py-2",
        className
      )}
    >
      <p className="text-xs text-muted-foreground">
        {loading
          ? "Loading…"
          : `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canPrev || loading}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="size-3.5" aria-hidden />
          Previous
        </Button>

        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            goToPage()
          }}
        >
          <span className="text-xs text-muted-foreground">Page</span>
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="Page number"
            value={pageInput}
            disabled={loading}
            onChange={(e) => setPageInput(e.target.value)}
            className="h-8 w-14 px-2 text-center font-mono text-xs"
          />
          <span className="text-xs text-muted-foreground">
            of {pages.toLocaleString()}
          </span>
          <Button type="submit" size="sm" variant="outline" disabled={loading}>
            Go
          </Button>
        </form>

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canNext || loading}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight className="size-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  )
}
