"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Coins } from "lucide-react"

import { useLogout, useSessionDetails, useSessionUser } from "@/features/auth/hooks"
import { CartNavLink } from "@/features/store/components/CartNavLink"
import { isAdminLevel } from "@/lib/admin-level"
import { SkinSwitcher } from "@/components/skin-switcher"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  DEFAULT_SITE_ICON_URL,
  DEFAULT_SITE_NAME,
  splitSiteName,
} from "@/lib/website-branding"

const navClass =
  "shrink-0 text-xs uppercase text-nav-muted transition-colors hover:text-gold-dim no-underline tracking-[var(--density-nav-tracking)]"

/** Live CP from lobby — only mounted when store is on + user logged in. */
function HeaderCpBalance() {
  const { data, isLoading } = useSessionDetails()
  const cp = data?.cp

  return (
    <Link
      href="/account"
      className={cn(
        navClass,
        "inline-flex items-center gap-1 tabular-nums text-gold-dim hover:text-gold-hot"
      )}
      title="Your CP balance"
    >
      <Coins className="size-3.5 shrink-0" aria-hidden />
      <span>
        {isLoading ? "…" : cp != null ? cp.toLocaleString() : "—"}
        <span className="ml-0.5 opacity-80">CP</span>
      </span>
    </Link>
  )
}

export function SiteHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSessionUser()
  const logoutMutation = useLogout()
  const admin = isAdminLevel(session?.userLevel)
  const [wikiEnabled, setWikiEnabled] = useState(false)
  const [storeEnabled, setStoreEnabled] = useState(false)
  const [siteName, setSiteName] = useState(DEFAULT_SITE_NAME)
  const [iconUrl, setIconUrl] = useState(DEFAULT_SITE_ICON_URL)

  useEffect(() => {
    let cancelled = false
    fetch("/api/wiki/status")
      .then((r) => r.json())
      .then((body: { enabled?: boolean }) => {
        if (!cancelled) setWikiEnabled(Boolean(body.enabled))
      })
      .catch(() => {
        if (!cancelled) setWikiEnabled(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch("/api/store/status")
      .then((r) => r.json())
      .then((body: { enabled?: boolean }) => {
        if (!cancelled) setStoreEnabled(Boolean(body.enabled))
      })
      .catch(() => {
        if (!cancelled) setStoreEnabled(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch("/api/branding")
      .then((r) => r.json())
      .then(
        (body: {
          success?: boolean
          data?: { siteName?: string; iconUrl?: string | null }
        }) => {
          if (cancelled || !body.success || !body.data) return
          if (body.data.siteName?.trim()) setSiteName(body.data.siteName.trim())
          setIconUrl(body.data.iconUrl?.trim() || DEFAULT_SITE_ICON_URL)
        }
      )
      .catch(() => {
        /* keep defaults */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const playHref = session ? "/account" : "/register"
  const playLabel = session ? "Account" : "Play now"
  const { lead, accent } = splitSiteName(siteName)

  return (
    <header className="border-b border-chrome-border bg-chrome">
      <div
        className="flex w-full items-center justify-between gap-2 px-3 py-(--density-header-y) sm:gap-3 sm:px-4 lg:px-5"
      >
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2 no-underline sm:gap-2.5"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={iconUrl}
            alt=""
            width={28}
            height={28}
            className="size-6 rounded-sm sm:size-7"
          />
          <p className="font-heading text-base tracking-[0.16em] text-accent-foreground uppercase sm:text-lg sm:tracking-[0.2em]">
            {lead ? `${lead} ` : null}
            <span className="text-gold transition-colors group-hover:text-gold-hot">
              {accent}
            </span>
          </p>
        </Link>

        <nav
          aria-label="Primary"
          className="flex shrink min-w-0 items-center gap-x-2 overflow-x-auto sm:gap-x-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <Link
            href="/news"
            className={cn(navClass, pathname.startsWith("/news") && "text-gold")}
          >
            News
          </Link>
          <Link
            href="/events"
            className={cn(
              navClass,
              (pathname.startsWith("/events") ||
                pathname.startsWith("/payouts")) &&
                "text-gold"
            )}
          >
            Events
          </Link>
          <Link
            href="/download"
            className={cn(
              navClass,
              pathname.startsWith("/download") && "text-gold"
            )}
          >
            Download
          </Link>
          <Link
            href="/armory"
            className={cn(
              navClass,
              pathname.startsWith("/armory") && "text-gold"
            )}
          >
            Armory
          </Link>
          {wikiEnabled ? (
            <Link
              href="/builder"
              className={cn(
                navClass,
                pathname.startsWith("/builder") && "text-gold"
              )}
            >
              Builder
            </Link>
          ) : null}
          {wikiEnabled ? (
            <Link
              href="/wiki"
              className={cn(
                navClass,
                pathname.startsWith("/wiki") && "text-gold"
              )}
            >
              Wiki
            </Link>
          ) : null}
          {admin ? (
            <Link
              href="/admin"
              className={cn(
                navClass,
                pathname.startsWith("/admin") && "text-gold"
              )}
            >
              Admin
            </Link>
          ) : null}

          {session ? (
            <>
              {wikiEnabled && storeEnabled ? <HeaderCpBalance /> : null}
              {wikiEnabled && storeEnabled ? <CartNavLink /> : null}
              <Link
                href="/account"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "shrink-0 uppercase tracking-wider",
                  pathname.startsWith("/account") && "border-gold-dim text-gold"
                )}
              >
                Account
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 uppercase tracking-wider text-nav-muted"
                disabled={logoutMutation.isPending}
                onClick={() => {
                  logoutMutation.mutate(undefined, {
                    onSuccess: () => {
                      router.push("/")
                      router.refresh()
                    },
                  })
                }}
              >
                Log out
              </Button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className={cn(navClass, pathname === "/login" && "text-gold")}
              >
                Log in
              </Link>
              <Link
                href={playHref}
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "shrink-0 uppercase tracking-wider"
                )}
              >
                {playLabel}
              </Link>
            </>
          )}
          <SkinSwitcher className="ml-0.5 shrink-0 sm:ml-1" />
        </nav>
      </div>
    </header>
  )
}
