"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { AccountGearBuilds } from "@/features/account/components/AccountGearBuilds"
import { AccountGmCommands } from "@/features/account/components/AccountGmCommands"
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
      <div className="mx-auto w-full max-w-7xl px-4 py-10 text-sm text-muted-foreground sm:px-5">
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
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 sm:px-5">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-4 border border-border bg-card/80 px-5 py-4">
        <div className="min-w-0">
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
        <div className="flex flex-wrap items-end gap-2">
          {(
            [
              ["CP", (details.cp ?? 0).toLocaleString()],
              ["Characters", String(details.characterCount ?? 0)],
              ["GM level", String(details.userLevel ?? 0)],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              className="min-w-24 border border-border bg-muted px-3 py-2 text-center"
            >
              <p className="text-[0.65rem] tracking-wider text-muted-foreground uppercase">
                {label}
              </p>
              <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-gold">
                {value}
              </p>
            </div>
          ))}
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
        </div>
      </header>

      <div className="mt-3 grid items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <section className="border border-border bg-card/60 px-4 py-4">
          <h2 className="font-heading text-sm tracking-[0.15em] text-gold uppercase">
            Account info
          </h2>
          <dl className="mt-3 space-y-2.5 text-sm">
            {infoRows.map((row) => (
              <div key={row.label} className="min-w-0">
                <dt className="text-[11px] tracking-wider text-muted-foreground uppercase">
                  {row.label}
                </dt>
                <dd className="mt-0.5 font-medium break-all text-foreground">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          {details.banReason ? (
            <p className="mt-3 text-sm font-medium text-[#ff9b9b]">
              Ban: {details.banReason}
              {details.banInitiator ? ` (${details.banInitiator})` : ""}
            </p>
          ) : null}
        </section>

        <AccountGearBuilds />

        <section className="border border-border bg-card/60 px-4 py-4">
          <h2 className="font-heading text-sm tracking-[0.15em] text-gold uppercase">
            Email
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Optional. Used for password reset if you forget your password.
          </p>
          <div className="mt-3">
            <ChangeEmailForm defaultValue={details.email || ""} />
          </div>
        </section>

        <section className="border border-border bg-card/60 px-4 py-4">
          <h2 className="font-heading text-sm tracking-[0.15em] text-gold uppercase">
            Change password
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            You&apos;ll need to sign in again after changing it.
          </p>
          <div className="mt-3">
            <ChangePasswordForm />
          </div>
        </section>
      </div>

      <div className="mt-3">
        <AccountGmCommands userLevel={details.userLevel ?? 0} />
      </div>
    </div>
  )
}
