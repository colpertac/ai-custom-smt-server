"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

import { WikiSearch } from "@/features/wiki/components/WikiSearch"
import { WIKI_NAV, wikiNavActive } from "@/features/wiki/wiki-nav"
import { cn } from "@/lib/utils"

type WikiStatusCounts = {
  itemCount: number
  weapons: number
  armor: number
  items: number
}

export function WikiShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [counts, setCounts] = useState<WikiStatusCounts | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/wiki/status")
      .then((res) => res.json())
      .then(
        (data: {
          enabled?: boolean
          itemCount?: number
          counts?: { weapons?: number; armor?: number; items?: number }
        }) => {
          if (cancelled || !data.enabled) return
          setCounts({
            itemCount: data.itemCount ?? 0,
            weapons: data.counts?.weapons ?? 0,
            armor: data.counts?.armor ?? 0,
            items: data.counts?.items ?? 0,
          })
        }
      )
      .catch(() => {
        /* ignore */
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="site-atmosphere w-full px-3 py-4 sm:px-4 lg:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
        <aside className="lg:w-48 shrink-0 lg:sticky lg:top-4">
          <Link
            href="/wiki"
            className="font-heading text-base tracking-[0.14em] text-foreground uppercase no-underline hover:text-gold-hot"
          >
            Item wiki
          </Link>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {counts
              ? `${counts.itemCount.toLocaleString()} game items`
              : "Loading catalog…"}
          </p>

          <div className="mt-3 border border-border bg-card/50 p-2">
            <WikiSearch size="sm" />
          </div>

          <nav
            aria-label="Wiki"
            className="mt-3 flex flex-col gap-0 text-sm"
          >
            {WIKI_NAV.map((item) => {
              const on = wikiNavActive(pathname, item)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-2 py-1.5 no-underline transition-colors",
                    on
                      ? "border-l-2 border-gold bg-muted/50 text-gold"
                      : "border-l-2 border-transparent text-muted-foreground hover:border-gold-dim hover:text-gold-dim"
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <dl className="mt-4 space-y-1.5 border-t border-border pt-3 text-xs">
            <WikiCount label="Weapons" count={counts?.weapons} />
            <WikiCount label="Armor" count={counts?.armor} />
            <WikiCount label="Items" count={counts?.items} />
          </dl>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}

function WikiCount({
  label,
  count,
}: {
  label: string
  count: number | undefined
}) {
  return (
    <div className="flex justify-between gap-3 text-muted-foreground">
      <dt>{label}</dt>
      <dd className="font-mono text-foreground">
        {count != null ? count.toLocaleString() : "—"}
      </dd>
    </div>
  )
}

export function WikiBreadcrumb({
  segments,
}: {
  segments: Array<{ label: string; href?: string }>
}) {
  return (
    <p className="text-xs tracking-wide text-muted-foreground">
      {segments.map((seg, i) => (
        <span key={`${seg.label}-${i}`}>
          {i > 0 ? <span className="mx-2 text-border">/</span> : null}
          {seg.href ? (
            <Link href={seg.href} className="hover:text-gold-dim no-underline">
              {seg.label}
            </Link>
          ) : (
            <span>{seg.label}</span>
          )}
        </span>
      ))}
    </p>
  )
}

export function WikiPageHeader({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <header>
      <h1 className="font-heading text-2xl font-semibold tracking-[0.1em] uppercase">
        {title}
      </h1>
      <div className="gold-rule mt-2 max-w-xs" />
      {description ? (
        <p className="mt-2 max-w-3xl text-sm leading-snug text-muted-foreground">
          {description}
        </p>
      ) : null}
    </header>
  )
}
