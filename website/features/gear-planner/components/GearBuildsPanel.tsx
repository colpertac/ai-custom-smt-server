"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import { useSessionUser } from "@/features/auth/hooks"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { PlannerStoredState } from "@/lib/gear-planner-combat"

type BuildSummary = {
  id: string
  name: string
  shareToken: string | null
  isPublished?: boolean
  publishedAt?: number | null
  updatedAt: number
  createdAt: number
}

export function GearBuildsPanel({
  payload,
  onLoad,
  initialActive,
}: {
  payload: PlannerStoredState
  onLoad: (payload: unknown) => void
  initialActive?: { id: string; name: string } | null
}) {
  const { data: session, isLoading: sessionLoading } = useSessionUser()
  const [builds, setBuilds] = useState<BuildSummary[]>([])
  const [name, setName] = useState(initialActive?.name ?? "")
  const [activeId, setActiveId] = useState<string | null>(
    initialActive?.id ?? null
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [open, setOpen] = useState(Boolean(initialActive))

  useEffect(() => {
    if (!initialActive) return
    setActiveId(initialActive.id)
    setName(initialActive.name)
    setOpen(true)
  }, [initialActive])

  const refresh = useCallback(async () => {
    if (!session) {
      setBuilds([])
      return
    }
    try {
      const res = await fetch("/api/builder/builds")
      const json = (await res.json()) as {
        data?: { builds?: BuildSummary[] }
        message?: string
      }
      if (!res.ok) {
        setError(json.message ?? "Failed to load builds")
        return
      }
      setBuilds(json.data?.builds ?? [])
      setError(null)
    } catch {
      setError("Failed to load builds")
    }
  }, [session])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const activePublished = useMemo(() => {
    if (!activeId) return false
    return Boolean(builds.find((b) => b.id === activeId)?.isPublished)
  }, [activeId, builds])

  if (sessionLoading) return null

  if (!session) {
    return (
      <div className="border border-border bg-card/40 px-3 py-2 text-xs text-muted-foreground">
        <Link href="/login" className="text-gold-dim hover:text-gold-hot">
          Log in
        </Link>{" "}
        to save builds, publish to the community gallery, and buy this loadout
        with CP (mailbox delivery). Drafts still autosave in this browser.{" "}
        <Link
          href="/builder/community"
          className="text-gold-dim hover:text-gold-hot"
        >
          Browse community builds
        </Link>
        .
      </div>
    )
  }

  const saveNew = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/builder/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || "Untitled build",
          payload,
        }),
      })
      const json = (await res.json()) as {
        data?: BuildSummary
        message?: string
      }
      if (!res.ok) {
        setError(json.message ?? "Save failed")
        return
      }
      if (json.data) {
        setActiveId(json.data.id)
        setName(json.data.name)
      }
      await refresh()
    } catch {
      setError("Save failed")
    } finally {
      setBusy(false)
    }
  }

  const overwrite = async () => {
    if (!activeId) {
      await saveNew()
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/builder/builds/${activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          payload,
        }),
      })
      const json = (await res.json()) as { message?: string }
      if (!res.ok) {
        setError(json.message ?? "Update failed")
        return
      }
      await refresh()
    } catch {
      setError("Update failed")
    } finally {
      setBusy(false)
    }
  }

  const loadBuild = async (id: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/builder/builds/${id}`)
      const json = (await res.json()) as {
        data?: { id: string; name: string; payload: unknown }
        message?: string
      }
      if (!res.ok || !json.data) {
        setError(json.message ?? "Load failed")
        return
      }
      onLoad(json.data.payload)
      setActiveId(json.data.id)
      setName(json.data.name)
      setShareUrl(null)
    } catch {
      setError("Load failed")
    } finally {
      setBusy(false)
    }
  }

  const removeBuild = async (id: string) => {
    if (!window.confirm("Delete this saved build?")) return
    setBusy(true)
    try {
      await fetch(`/api/builder/builds/${id}`, { method: "DELETE" })
      if (activeId === id) setActiveId(null)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const copyLink = async () => {
    if (!activeId) {
      setError("Save the build first, then copy a link")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/builder/builds/${activeId}/share`, {
        method: "POST",
      })
      const json = (await res.json()) as {
        data?: { path: string }
        message?: string
      }
      if (!res.ok || !json.data) {
        setError(json.message ?? "Copy link failed")
        return
      }
      const url = `${window.location.origin}${json.data.path}`
      setShareUrl(url)
      try {
        await navigator.clipboard.writeText(url)
      } catch {
        /* ignore */
      }
      await refresh()
    } catch {
      setError("Copy link failed")
    } finally {
      setBusy(false)
    }
  }

  const togglePublish = async () => {
    if (!activeId) {
      setError("Save the build first, then publish")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/builder/builds/${activeId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !activePublished }),
      })
      const json = (await res.json()) as {
        data?: { path?: string | null; isPublished?: boolean }
        message?: string
      }
      if (!res.ok) {
        setError(json.message ?? "Publish failed")
        return
      }
      if (json.data?.isPublished && json.data.path) {
        const url = `${window.location.origin}${json.data.path}`
        setShareUrl(url)
        try {
          await navigator.clipboard.writeText(url)
        } catch {
          /* ignore */
        }
      }
      await refresh()
    } catch {
      setError("Publish failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border border-border bg-card/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-heading text-xs tracking-[0.14em] text-gold-dim uppercase">
          My builds
        </h3>
        <div className="flex items-center gap-1">
          <Link
            href="/builder/community"
            className="px-1 text-[11px] text-gold-dim no-underline hover:text-gold-hot"
          >
            Community
          </Link>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide" : "Show"}
          </Button>
        </div>
      </div>
      {!open ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Signed in as {session.dispName ?? session.username}. Expand to
          save / load / publish.
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <Field className="min-w-[10rem] flex-1">
              <FieldLabel htmlFor="gp-build-name">Name</FieldLabel>
              <Input
                id="gp-build-name"
                className="h-8 text-xs"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 60K DMG Male Mage"
              />
            </Field>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void overwrite()}
            >
              {activeId ? "Save" : "Save new"}
            </Button>
            {activeId ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void saveNew()}
              >
                Save as new
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant={activePublished ? "outline" : "default"}
              disabled={busy || !activeId}
              onClick={() => void togglePublish()}
            >
              {activePublished ? "Unpublish" : "Publish"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy || !activeId}
              onClick={() => void copyLink()}
            >
              Copy link
            </Button>
          </div>
          {activePublished ? (
            <p className="text-[11px] text-emerald-300/90">
              Listed in the{" "}
              <Link
                href="/builder/community"
                className="underline hover:text-gold-hot"
              >
                community gallery
              </Link>
              . Copy link still works if you unpublish later.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Publish to list this build for everyone. Copy link makes an
              unlisted URL without listing it.
            </p>
          )}
          {shareUrl ? (
            <p className="break-all text-[11px] text-violet-300">
              Copied: {shareUrl}
            </p>
          ) : null}
          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : null}
          {builds.length === 0 ? (
            <p className="text-xs text-muted-foreground">No saved builds yet.</p>
          ) : (
            <ul className="max-h-40 overflow-y-auto border border-border divide-y divide-border">
              {builds.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center gap-2 px-2 py-1.5 text-xs"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-[#c9a0ff] hover:text-gold-hot"
                    onClick={() => void loadBuild(b.id)}
                  >
                    {b.name}
                    {activeId === b.id ? " · current" : ""}
                    {b.isPublished ? " · published" : ""}
                  </button>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {new Date(b.updatedAt).toLocaleDateString()}
                  </span>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void removeBuild(b.id)}
                  >
                    Del
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
