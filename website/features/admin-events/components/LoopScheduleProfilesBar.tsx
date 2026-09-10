"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BookmarkPlus, ChevronDown, Loader2, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  deleteAdminLoopProfile,
  fetchAdminLoopProfiles,
  saveAdminLoopProfile,
} from "@/features/admin-events/api"
import {
  cloneProfileDays,
  DENSE_ARCHIVE_PROFILE_ID,
} from "@/lib/events/loop-profile-utils"
import type {
  EventScheduleLoopDay,
  EventScheduleLoopProfile,
} from "@/lib/events/types"
import { cn } from "@/lib/utils"

type Props = {
  alwaysOnIds: string[]
  loopDays: EventScheduleLoopDay[]
  onApplyProfile: (profile: EventScheduleLoopProfile) => void
  onMessage: (kind: "success" | "error", text: string) => void
}

export function LoopScheduleProfilesBar({
  alwaysOnIds,
  loopDays,
  onApplyProfile,
  onMessage,
}: Props) {
  const [profiles, setProfiles] = useState<EventScheduleLoopProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState<string>(DENSE_ARCHIVE_PROFILE_ID)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState("")
  const [saveDescription, setSaveDescription] = useState("")

  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchAdminLoopProfiles()
      setProfiles(data.profiles)
      setSelectedId((prev) =>
        data.profiles.some((p) => p.id === prev)
          ? prev
          : (data.profiles[0]?.id ?? DENSE_ARCHIVE_PROFILE_ID)
      )
    } catch (err) {
      onMessageRef.current(
        "error",
        err instanceof Error ? err.message : "Failed to load loop profiles"
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const selected = useMemo(
    () => profiles.find((p) => p.id === selectedId) ?? null,
    [profiles, selectedId]
  )

  const applySelected = () => {
    if (!selected) return
    onApplyProfile({
      ...selected,
      alwaysOnIds: [...selected.alwaysOnIds],
      days: cloneProfileDays(selected.days),
    })
    onMessage(
      "success",
      `Loaded “${selected.name}” (${selected.days.length} days) — autosaving.`
    )
  }

  const applyDense = () => {
    const dense = profiles.find((p) => p.id === DENSE_ARCHIVE_PROFILE_ID)
    if (!dense) return
    setSelectedId(dense.id)
    onApplyProfile({
      ...dense,
      alwaysOnIds: [...dense.alwaysOnIds],
      days: cloneProfileDays(dense.days),
    })
    onMessage(
      "success",
      `Loaded Dense archive cycle (${dense.days.length} days) — autosaving.`
    )
  }

  const onSaveNew = async () => {
    const name = saveName.trim()
    if (!name) {
      onMessage("error", "Enter a name to save this loop as a profile.")
      return
    }
    setBusy(true)
    try {
      const result = await saveAdminLoopProfile({
        name,
        description: saveDescription.trim(),
        alwaysOnIds,
        days: loopDays,
      })
      setProfiles(result.profiles)
      setSelectedId(result.profile.id)
      setSaveName("")
      setSaveDescription("")
      setSaveOpen(false)
      onMessage("success", `Saved loop profile “${result.profile.name}”.`)
    } catch (err) {
      onMessage(
        "error",
        err instanceof Error ? err.message : "Failed to save profile"
      )
    } finally {
      setBusy(false)
    }
  }

  const onOverwrite = async () => {
    if (!selected || selected.builtin) return
    setBusy(true)
    try {
      const result = await saveAdminLoopProfile({
        id: selected.id,
        name: selected.name,
        description: selected.description,
        alwaysOnIds,
        days: loopDays,
      })
      setProfiles(result.profiles)
      onMessage("success", `Updated profile “${selected.name}”.`)
    } catch (err) {
      onMessage(
        "error",
        err instanceof Error ? err.message : "Failed to update profile"
      )
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async () => {
    if (!selected || selected.builtin) return
    if (
      !window.confirm(
        `Delete saved profile “${selected.name}”? This does not change the live schedule.`
      )
    ) {
      return
    }
    setBusy(true)
    try {
      const result = await deleteAdminLoopProfile(selected.id)
      setProfiles(result.profiles)
      setSelectedId(DENSE_ARCHIVE_PROFILE_ID)
      onMessage("success", `Deleted profile “${selected.name}”.`)
    } catch (err) {
      onMessage(
        "error",
        err instanceof Error ? err.message : "Failed to delete profile"
      )
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded border border-border/60 bg-muted/15 px-3 py-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Loading profiles…
      </div>
    )
  }

  return (
    <div className="rounded border border-border/60 bg-muted/10 px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
          Profile
        </span>
        <select
          className="h-8 min-w-[10rem] flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground sm:max-w-xs"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={busy}
          aria-label="Loop profile"
          title={selected?.description || undefined}
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.builtin ? "★ " : ""}
              {p.name}
              {p.builtin ? " (built-in)" : ""} · {p.days.length}d
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || !selected}
          onClick={applySelected}
        >
          Load
        </Button>
        <TooltipProvider delay={200}>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy || !profiles.some((p) => p.builtin)}
                  onClick={applyDense}
                />
              }
            >
              Dense cycle
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              align="end"
              className="max-w-sm text-left leading-snug"
            >
              Built-in preset: rotate through as much of the catalog as possible
              in a short loop. Not seasonal. Separates main/post, shared NPC
              spots, and hard conflicts. Always-on: Under Wonderground + Daily
              Mission chests / hack limits.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || !selected || selected.builtin}
          onClick={() => void onOverwrite()}
        >
          Overwrite
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy || !selected || selected.builtin}
          onClick={() => void onDelete()}
          aria-label="Delete profile"
        >
          <Trash2 className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => setSaveOpen((v) => !v)}
          aria-expanded={saveOpen}
          className="ml-auto gap-1"
        >
          Save as…
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform",
              saveOpen && "rotate-180"
            )}
          />
        </Button>
      </div>

      {saveOpen ? (
        <div className="mt-2 grid gap-2 border-t border-border/50 pt-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Profile name"
            className="h-8 text-xs"
            disabled={busy}
            aria-label="New profile name"
          />
          <Input
            value={saveDescription}
            onChange={(e) => setSaveDescription(e.target.value)}
            placeholder="Note (optional)"
            className="h-8 text-xs"
            disabled={busy}
            aria-label="Profile description"
          />
          <Button
            type="button"
            size="sm"
            disabled={busy || loopDays.length === 0}
            onClick={() => void onSaveNew()}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <BookmarkPlus className="size-3.5" />
            )}
            Save
          </Button>
        </div>
      ) : null}
    </div>
  )
}
