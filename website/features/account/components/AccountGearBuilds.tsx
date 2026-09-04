"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type BuildSummary = {
  id: string
  name: string
  shareToken: string | null
  updatedAt: number
  createdAt: number
}

export function AccountGearBuilds() {
  const [builds, setBuilds] = useState<BuildSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/builder/builds")
      const json = (await res.json()) as {
        data?: { builds?: BuildSummary[] }
        message?: string
      }
      if (!res.ok) {
        setError(json.message ?? "Failed to load builds")
        setBuilds([])
        return
      }
      setBuilds(json.data?.builds ?? [])
    } catch {
      setError("Failed to load builds")
      setBuilds([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const share = async (id: string) => {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/builder/builds/${id}/share`, {
        method: "POST",
      })
      const json = (await res.json()) as {
        data?: { path: string }
        message?: string
      }
      if (!res.ok || !json.data) {
        setError(json.message ?? "Share failed")
        return
      }
      const url = `${window.location.origin}${json.data.path}`
      try {
        await navigator.clipboard.writeText(url)
        setCopiedId(id)
        window.setTimeout(() => setCopiedId(null), 2500)
      } catch {
        setError(`Share URL: ${url}`)
      }
      await refresh()
    } catch {
      setError("Share failed")
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Delete build “${name}”?`)) return
    setBusyId(id)
    try {
      await fetch(`/api/builder/builds/${id}`, { method: "DELETE" })
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="mt-3 border border-border bg-card/60 px-5 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-sm tracking-[0.15em] text-gold uppercase">
            Gear builds
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Saved loadouts from the{" "}
            <Link
              href="/builder"
              className="text-gold-dim hover:text-gold-hot"
            >
              gear builder
            </Link>
            . Open one to continue editing, or copy a share link.
          </p>
        </div>
        <Link
          href="/builder"
          className={cn(
            buttonVariants({ variant: "outline", size: "xs" }),
            "no-underline uppercase tracking-wider"
          )}
        >
          Open builder
        </Link>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading builds…</p>
      ) : error ? (
        <p className="mt-4 text-sm text-destructive">{error}</p>
      ) : builds.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No saved builds yet. Create one in the builder while signed in.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border border border-border">
          {builds.map((b) => (
            <li
              key={b.id}
              className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-[#c9a0ff]">{b.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  Updated {new Date(b.updatedAt).toLocaleString()}
                  {b.shareToken ? " · shareable" : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Link
                  href={`/builder?build=${encodeURIComponent(b.id)}`}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "xs" }),
                    "no-underline"
                  )}
                >
                  Open
                </Link>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={busyId === b.id}
                  onClick={() => void share(b.id)}
                >
                  {copiedId === b.id ? "Copied" : "Share"}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={busyId === b.id}
                  onClick={() => void remove(b.id, b.name)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
