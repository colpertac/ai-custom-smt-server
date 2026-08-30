import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import {
  ARMORY_SEARCH_PAGE_SIZE,
  type ArmoryCharacterHit,
  type ArmorySearchResult,
} from "@/lib/armory"
import { cn } from "@/lib/utils"

function ArmoryListPagination({
  total,
  page,
  pageSize = ARMORY_SEARCH_PAGE_SIZE,
  pageHref,
}: {
  total: number
  page: number
  pageSize?: number
  pageHref: (page: number) => string
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null

  const start = page * pageSize + 1
  const end = Math.min(total, (page + 1) * pageSize)
  const canPrev = page > 0
  const canNext = page + 1 < pages

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-card/40 px-3 py-2">
      <p className="text-xs text-muted-foreground">
        Showing {start.toLocaleString()}–{end.toLocaleString()} of{" "}
        {total.toLocaleString()}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {canPrev ? (
          <Link
            href={pageHref(page - 1)}
            className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
          >
            <ChevronLeft className="size-3.5" aria-hidden />
            Previous
          </Link>
        ) : (
          <span
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              "pointer-events-none opacity-40"
            )}
          >
            <ChevronLeft className="size-3.5" aria-hidden />
            Previous
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          Page {page + 1} of {pages.toLocaleString()}
        </span>
        {canNext ? (
          <Link
            href={pageHref(page + 1)}
            className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
          >
            Next
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        ) : (
          <span
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              "pointer-events-none opacity-40"
            )}
          >
            Next
            <ChevronRight className="size-3.5" aria-hidden />
          </span>
        )}
      </div>
    </div>
  )
}

function ArmoryGenderIcon({ gender }: { gender: number }) {
  if (gender === 0) {
    return (
      <span
        className="inline-flex size-4 items-center justify-center text-sm font-semibold text-[#5eb0ff]"
        title="Male"
        aria-label="Male"
      >
        ♂
      </span>
    )
  }
  if (gender === 1) {
    return (
      <span
        className="inline-flex size-4 items-center justify-center text-sm font-semibold text-[#ff7eb3]"
        title="Female"
        aria-label="Female"
      >
        ♀
      </span>
    )
  }
  return (
    <span className="text-xs text-muted-foreground" title={`Gender ${gender}`}>
      ?
    </span>
  )
}

function ArmoryCharacterRow({ hit }: { hit: ArmoryCharacterHit }) {
  return (
    <li className="border border-border bg-card/40 px-3 py-2.5">
      <Link
        href={`/armory/${encodeURIComponent(hit.name)}`}
        className="flex flex-wrap items-center justify-between gap-2 hover:text-gold-dim"
      >
        <span className="font-medium text-[#e8ecf4]">{hit.name}</span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {hit.level != null ? `Lv. ${hit.level}` : "Level unknown"}
          <ArmoryGenderIcon gender={hit.gender} />
          {hit.clanName ? ` · ${hit.clanName}` : ""}
        </span>
      </Link>
    </li>
  )
}

export function ArmoryCharacterListPanel({
  items,
  total,
  page,
  pageSize = ARMORY_SEARCH_PAGE_SIZE,
  pageHref,
  summary,
  emptyMessage = "No characters found.",
}: {
  items: ArmoryCharacterHit[]
  total: number
  page: number
  pageSize?: number
  pageHref: (page: number) => string
  summary?: string
  emptyMessage?: string
}) {
  if (total === 0) {
    return (
      <div className="border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {summary ? (
        <p className="text-sm text-muted-foreground">{summary}</p>
      ) : null}

      <ArmoryListPagination
        total={total}
        page={page}
        pageSize={pageSize}
        pageHref={pageHref}
      />

      <ul className="space-y-2">
        {items.map((hit) => (
          <ArmoryCharacterRow key={hit.name} hit={hit} />
        ))}
      </ul>

      <ArmoryListPagination
        total={total}
        page={page}
        pageSize={pageSize}
        pageHref={pageHref}
      />
    </div>
  )
}

function armorySearchPageHref(query: string, page: number): string {
  const params = new URLSearchParams({ q: query })
  if (page > 0) params.set("page", String(page + 1))
  return `/armory/search?${params.toString()}`
}

export function ArmorySearchResults({
  result,
  page,
}: {
  result: ArmorySearchResult
  page: number
}) {
  const { query, total, items } = result

  return (
    <ArmoryCharacterListPanel
      items={items}
      total={total}
      page={page}
      pageHref={(p) => armorySearchPageHref(query, p)}
      summary={`${total.toLocaleString()} match${total === 1 ? "" : "es"} for "${query}"`}
      emptyMessage={`No characters matching "${query}". Try a shorter or different name.`}
    />
  )
}

export function armoryBrowsePageHref(page: number): string {
  return page > 0 ? `/armory?page=${page + 1}` : "/armory"
}
