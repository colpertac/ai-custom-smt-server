"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { ChangeEmailForm } from "@/features/auth/components/ChangeEmailForm"
import { ChangePasswordForm } from "@/features/auth/components/ChangePasswordForm"
import { useLogout, useSessionDetails } from "@/features/auth/hooks"
import { ADMIN_USER_LEVEL } from "@/lib/admin-level"
import { Button } from "@/components/ui/button"

function formatLastLogin(epoch?: number): string {
  if (!epoch) return "Never"
  return new Date(epoch * 1000).toLocaleString()
}

export function AccountPanel() {
  const router = useRouter()
  const { data: details, isLoading, isError, isFetched } = useSessionDetails()
  const logoutMutation = useLogout()

  useEffect(() => {
    if (isFetched && (isError || !details)) {
      router.replace("/login")
    }
  }, [details, isError, isFetched, router])

  if (isLoading || !details) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-muted-foreground">
        Loading account…
      </div>
    )
  }

  const infoRows: { label: string; value: string }[] = [
    { label: "Username", value: details.username },
    { label: "Email", value: details.email || "(none)" },
    { label: "Tickets", value: String(details.ticketCount ?? 0) },
    { label: "Status", value: details.enabled ? "Active" : "Disabled" },
    { label: "Last login", value: formatLastLogin(details.lastLogin) },
  ]

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border border-border bg-card/80 px-5 py-5">
        <div>
          <p className="text-[0.7rem] tracking-[0.25em] text-gold-dim uppercase">
            Signed in
          </p>
          <h1 className="font-heading mt-1 text-3xl font-bold tracking-[0.08em] text-foreground uppercase">
            {details.username}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Same login for this site and the game client.
            {(details.userLevel ?? 0) >= ADMIN_USER_LEVEL ? (
              <>
                {" "}
                <Link
                  href="/admin"
                  className="text-gold underline-offset-2 hover:underline"
                >
                  Open admin
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="uppercase tracking-wider"
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
      </header>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {(
          [
            ["CP", (details.cp ?? 0).toLocaleString()],
            ["Characters", String(details.characterCount ?? 0)],
            ["Level", String(details.userLevel ?? 0)],
          ] as const
        ).map(([label, value]) => (
          <div
            key={label}
            className="border border-border bg-muted px-3 py-3 text-center"
          >
            <p className="text-[0.65rem] tracking-wider text-muted-foreground uppercase">
              {label}
            </p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-gold">
              {value}
            </p>
          </div>
        ))}
      </div>

      <section className="mt-3 border border-border bg-card/60 px-5 py-5">
        <h2 className="font-heading text-sm tracking-[0.15em] text-gold uppercase">
          Account info
        </h2>
        <dl className="mt-4 space-y-3 text-sm">
          {infoRows.map((row) => (
            <div
              key={row.label}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/80 pb-3 last:border-0 last:pb-0"
            >
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="text-right font-medium break-all text-foreground">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
        {details.banReason ? (
          <p className="mt-4 text-sm font-medium text-[#ff9b9b]">
            Ban: {details.banReason}
            {details.banInitiator ? ` (${details.banInitiator})` : ""}
          </p>
        ) : null}
      </section>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <section className="border border-border bg-card/60 px-5 py-5">
          <h2 className="font-heading text-sm tracking-[0.15em] text-gold uppercase">
            Email
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Optional. Used if we add password recovery later.
          </p>
          <div className="mt-4">
            <ChangeEmailForm defaultValue={details.email || ""} />
          </div>
        </section>

        <section className="border border-border bg-card/60 px-5 py-5">
          <h2 className="font-heading text-sm tracking-[0.15em] text-gold uppercase">
            Change password
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            You&apos;ll need to sign in again after changing it.
          </p>
          <div className="mt-4">
            <ChangePasswordForm />
          </div>
        </section>
      </div>
    </div>
  )
}
