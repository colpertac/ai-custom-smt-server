"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import { useLogout, useSessionUser } from "@/features/auth/hooks"
import { isAdminLevel } from "@/lib/admin-level"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navClass =
  "text-xs tracking-[0.14em] uppercase text-[#aaa] transition-colors hover:text-gold-dim no-underline"

export function SiteHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSessionUser()
  const logoutMutation = useLogout()
  const admin = isAdminLevel(session?.userLevel)

  const playHref = session ? "/account" : "/register"
  const playLabel = session ? "Account" : "Play now"

  return (
    <header className="border-b border-[#2a2a2a] bg-[#141414]">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="group no-underline">
          <p className="font-heading text-lg tracking-[0.2em] text-[#e8ecf4] uppercase">
            Imagine{" "}
            <span className="text-gold transition-colors group-hover:text-gold-hot">
              Private
            </span>
          </p>
        </Link>

        <nav
          aria-label="Primary"
          className="flex flex-wrap items-center gap-x-4 gap-y-2"
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
                  "uppercase tracking-wider",
                  pathname.startsWith("/account") && "border-gold-dim text-gold"
                )}
              >
                Account
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="uppercase tracking-wider text-[#aaa]"
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
                  "uppercase tracking-wider"
                )}
              >
                {playLabel}
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
