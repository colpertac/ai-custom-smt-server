"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import { useLogout, useSessionUser } from "@/features/auth/hooks"
import { isAdminLevel } from "@/lib/admin-level"
import { SkinSwitcher } from "@/components/skin-switcher"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navClass =
  "shrink-0 text-xs uppercase text-nav-muted transition-colors hover:text-gold-dim no-underline tracking-[var(--density-nav-tracking)]"

export function SiteHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSessionUser()
  const logoutMutation = useLogout()
  const admin = isAdminLevel(session?.userLevel)

  const playHref = session ? "/account" : "/register"
  const playLabel = session ? "Account" : "Play now"

  return (
    <header className="border-b border-chrome-border bg-chrome">
      <div
        className="flex w-full items-center justify-between gap-2 px-3 py-(--density-header-y) sm:gap-3 sm:px-4 lg:px-5"
      >
        <Link href="/" className="group shrink-0 no-underline">
          <p className="font-heading text-base tracking-[0.16em] text-accent-foreground uppercase sm:text-lg sm:tracking-[0.2em]">
            Imagine{" "}
            <span className="text-gold transition-colors group-hover:text-gold-hot">
              Private
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
            href="/download"
            className={cn(
              navClass,
              pathname.startsWith("/download") && "text-gold"
            )}
          >
            Download
          </Link>
          <Link
            href="/status"
            className={cn(
              navClass,
              pathname.startsWith("/status") && "text-gold"
            )}
          >
            Status
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
          <Link
            href="/wiki"
            className={cn(
              navClass,
              pathname.startsWith("/wiki") && "text-gold"
            )}
          >
            Wiki
          </Link>
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
