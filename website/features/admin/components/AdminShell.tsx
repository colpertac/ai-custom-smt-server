"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  ADMIN_NAV,
  adminPageTitle,
  navItemActive,
} from "@/features/admin/admin-nav"
import { cn } from "@/lib/utils"

export function AdminShell({
  username,
  children,
}: {
  username: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const title = adminPageTitle(pathname)

  return (
    <div className="flex min-h-[calc(100svh-3.5rem)] w-full flex-col lg:flex-row">
      <aside className="shrink-0 border-b border-border bg-[#0c1018] lg:w-48 lg:border-r lg:border-b-0">
        <div className="border-b border-border px-3 py-2.5">
          <p className="truncate font-mono text-[0.65rem] text-muted-foreground">
            @{username}
          </p>
          <p className="truncate text-xs font-semibold text-foreground">Admin</p>
        </div>
        <nav
          aria-label="Admin"
          className="flex gap-1 overflow-x-auto px-2 py-2 lg:flex-col lg:overflow-visible lg:px-0 lg:py-1"
        >
          {ADMIN_NAV.map((item) => {
            const on = navItemActive(item, pathname)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "shrink-0 border-l-2 px-3 py-1.5 text-xs no-underline lg:w-full",
                  on
                    ? "border-gold bg-[#161c28] text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-[#121824] hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="hidden border-t border-border p-2 lg:block">
          <Link
            href="/account"
            className="block px-2 py-1.5 text-[0.65rem] text-muted-foreground no-underline hover:text-gold-dim"
          >
            ← Account
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-[#141414] px-4 py-2.5">
          <h1 className="text-sm font-semibold tracking-[0.08em] text-foreground uppercase">
            {title}
          </h1>
          <Link
            href="/account"
            className="text-[0.65rem] text-muted-foreground no-underline hover:text-gold-dim lg:hidden"
          >
            Account
          </Link>
        </header>
        <div className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5">
          {children}
        </div>
      </div>
    </div>
  )
}
