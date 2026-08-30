"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  countWikiCatalog,
  countWikiItems,
} from "@/content/wiki"
import { WikiSearch } from "@/features/wiki/components/WikiSearch"
import { WIKI_NAV, wikiNavActive } from "@/features/wiki/wiki-nav"
import { cn } from "@/lib/utils"

export function WikiShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="site-atmosphere mx-auto max-w-6xl px-4 py-8 lg:py-10">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <aside className="lg:w-56 shrink-0 lg:sticky lg:top-6">
          <Link
            href="/wiki"
            className="font-heading text-lg tracking-[0.14em] text-foreground uppercase no-underline hover:text-gold-hot"
          >
            Item wiki
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">
            {countWikiCatalog().toLocaleString()} game items
          </p>

          <div className="mt-5 border border-border bg-card/50 p-3">
            <WikiSearch size="sm" />
          </div>

          <nav
            aria-label="Wiki"
            className="mt-4 flex flex-col gap-0.5 text-sm"
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

          <dl className="mt-6 space-y-2 border-t border-border pt-4 text-xs">
            <WikiCount label="Weapons" count={countWikiItems("weapons")} />
            <WikiCount label="Armor" count={countWikiItems("armor")} />
            <WikiCount label="Items" count={countWikiItems("items")} />
          </dl>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}

function WikiCount({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex justify-between gap-3 text-muted-foreground">
      <dt>{label}</dt>
      <dd className="font-mono text-foreground">{count.toLocaleString()}</dd>
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
      <h1 className="font-heading text-3xl font-semibold tracking-[0.1em] uppercase">
        {title}
      </h1>
      <div className="gold-rule mt-3 max-w-xs" />
      {description ? (
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </header>
  )
}
