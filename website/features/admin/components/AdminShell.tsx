"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { ArrowLeft } from "lucide-react"

import {
  ADMIN_NAV_SECTIONS,
  adminPageTitle,
  navItemActive,
} from "@/features/admin/admin-nav"
import { useLaneAPending } from "@/features/admin/lane-a-pending"
import { useOpenReportsPending } from "@/features/admin/open-reports-pending"
import { api } from "@/lib/kyClient"
import { cn } from "@/lib/utils"

function navPendingDot(
  itemHref: string,
  laneAPending: boolean,
  openReportsPending: boolean
): { title: string } | null {
  if (itemHref === "/admin" && laneAPending) {
    return { title: "Unpublished changes — publish / restart needed" }
  }
  if (itemHref === "/admin/reports" && openReportsPending) {
    return { title: "Open player reports" }
  }
  return null
}

export function AdminShell({
  username,
  offlineOps = false,
  children,
}: {
  username: string
  offlineOps?: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const title = adminPageTitle(pathname)
  const laneA = useLaneAPending()
  const openReports = useOpenReportsPending()
  const [lobbyDown, setLobbyDown] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function refreshLobby() {
      try {
        const res = await api.get("status")
        const json = (await res.json()) as {
          success?: boolean
          data?: { services?: Array<{ id: string; state: string }> }
        }
        if (cancelled || !json.success) return
        const lobby = json.data?.services?.find((s) => s.id === "lobby")
        setLobbyDown(lobby?.state === "down")
      } catch {
        if (!cancelled) setLobbyDown(true)
      }
    }

    void refreshLobby()
    const id = window.setInterval(refreshLobby, 10_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  // Offline cookie or live lobby down — Overview (Start) only.
  const restrictNav = offlineOps || lobbyDown

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
          {ADMIN_NAV_SECTIONS.map((section) => (
            <div
              key={section.id}
              className="flex shrink-0 gap-1 lg:flex-col lg:gap-0 lg:py-1.5"
            >
              <p className="hidden px-3 pb-0.5 font-mono text-[0.6rem] tracking-[0.12em] text-muted-foreground/70 uppercase lg:block">
                {section.label}
              </p>
              {section.items.map((item) => {
                const on = navItemActive(item, pathname)
                const Icon = item.icon
                const pendingDot = navPendingDot(
                  item.href,
                  laneA.pending,
                  openReports.pending
                )
                const navClass = cn(
                  "flex shrink-0 items-center gap-2 border-l-2 px-3 py-1.5 text-xs no-underline lg:w-full",
                  on
                    ? "border-gold bg-[#161c28] text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-[#121824] hover:text-foreground"
                )
                const iconClass = cn(
                  "size-3.5 shrink-0",
                  on ? "text-gold-dim" : "text-muted-foreground"
                )
                const label = (
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="truncate">{item.label}</span>
                    {pendingDot ? (
                      <span
                        className="size-1.5 shrink-0 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.85)]"
                        title={pendingDot.title}
                        aria-label={pendingDot.title}
                      />
                    ) : null}
                  </span>
                )
                if (restrictNav && item.href !== "/admin") {
                  return (
                    <span
                      key={item.href}
                      aria-disabled
                      title="Unavailable while lobby is down — Start servers from Overview, then sign in again"
                      className={cn(
                        navClass,
                        "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground"
                      )}
                    >
                      <Icon className={iconClass} aria-hidden />
                      {label}
                    </span>
                  )
                }
                return (
                  <Link key={item.href} href={item.href} className={navClass}>
                    <Icon className={iconClass} aria-hidden />
                    {label}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="hidden border-t border-border p-2 lg:block">
          <Link
            href="/account"
            className="flex items-center gap-1.5 px-2 py-1.5 text-[0.65rem] text-muted-foreground no-underline hover:text-gold-dim"
          >
            <ArrowLeft className="size-3 shrink-0" aria-hidden />
            Account
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-chrome px-4 py-2.5">
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
        {restrictNav ? (
          <div
            role="status"
            className="border-b border-amber-500/40 bg-amber-950/40 px-4 py-2 text-xs text-amber-100"
          >
            Login service (lobby) is down. Use Overview to Start servers
            {offlineOps ? ", then sign in again" : ""}. Other admin tools stay
            disabled until lobby is up.
          </div>
        ) : null}
        <div
          className={cn(
            "mx-auto w-full flex-1 px-4 py-5",
            pathname.startsWith("/admin/studio")
              ? "max-w-none"
              : "max-w-[1400px]"
          )}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
