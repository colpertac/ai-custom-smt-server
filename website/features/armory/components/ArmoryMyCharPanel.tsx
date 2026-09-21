"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Mars, Venus } from "lucide-react"

import { fetchAccountCharacters } from "@/features/armory/api"
import { useSessionUser } from "@/features/auth/hooks"
import { FormAlert } from "@/components/form-alert"

export function ArmoryMyCharPanel() {
  const { data: session, isLoading: sessionLoading } = useSessionUser()
  const charsQuery = useQuery({
    queryKey: ["account", "characters"],
    queryFn: fetchAccountCharacters,
    enabled: Boolean(session?.username),
    retry: false,
  })

  if (sessionLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  if (!session) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Sign in to see your characters.
        </p>
        <Link
          href="/login"
          className="inline-flex h-8 items-center border border-border px-3 text-xs uppercase tracking-wider hover:bg-muted/40"
        >
          Sign in
        </Link>
      </div>
    )
  }

  if (charsQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading characters…</p>
  }

  if (charsQuery.isError) {
    return (
      <FormAlert>
        {charsQuery.error instanceof Error
          ? charsQuery.error.message
          : "Failed to load characters"}
      </FormAlert>
    )
  }

  const data = charsQuery.data
  if (!data) return null

  return (
    <div className="space-y-4">
      {!data.allowExpertiseDigiEdit ? (
        <p className="text-sm text-muted-foreground">
          Expertise / digi editing is not enabled for your GM level. An admin
          can turn it on under Admin → Accounts (global toggle + minimum GM
          level).
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Expertise / digi editing is enabled for your GM level. Open a
          character and use the Edit toggle. Log out of the game client before
          saving.
        </p>
      )}

      {!data.allowDemonReunionEdit ? (
        <p className="text-sm text-muted-foreground">
          Demon reunion / mitama editing is not enabled for your GM level. An
          admin can turn it on under Admin → Accounts (separate global toggle +
          minimum GM level).
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Demon reunion / mitama editing is enabled. Open a character&apos;s
          demons list, then a demon profile, and use the Edit toggle. Log out of
          the game client before saving.
        </p>
      )}

      {data.characters.length === 0 ? (
        <p className="text-sm text-muted-foreground">No characters on this account.</p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {data.characters.map((c) => (
            <li key={c.name}>
              <Link
                href={`/armory/${encodeURIComponent(c.name)}`}
                className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-muted/40"
              >
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  {c.gender === 0 ? (
                    <Mars className="size-3.5 shrink-0 text-sky-400" aria-hidden />
                  ) : c.gender === 1 ? (
                    <Venus
                      className="size-3.5 shrink-0 text-fuchsia-400"
                      aria-hidden
                    />
                  ) : null}
                  <span className="truncate">{c.name}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  Lv {c.level}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
