"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BookmarkPlus, Loader2, Trash2 } from "lucide-react"

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
      `Loaded “${selected.name}” (${selected.days.length} loop days) — autosaving. Restart on Overview (or wait for flip) to apply live.`
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
      <div className="flex items-center gap-2 rounded border border-border/60 bg-muted/15 px-3 py-2 text-[11px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Loading loop profiles…
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded border border-border/60 bg-muted/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <div className="text-xs font-medium text-foreground">
            Loop profiles & presets
          </div>
          <p className="max-w-2xl text-[11px] text-muted-foreground">
            Applying a profile does not change live events until the channel
            restarts (Overview or daily flip). The plan autosaves into the
            schedule.
          </p>
        </div>
        <TooltipProvider delay={200}>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy || !profiles.some((p) => p.builtin)}
                  onClick={() => {
                    const dense = profiles.find(
                      (p) => p.id === DENSE_ARCHIVE_PROFILE_ID
                    )
                    if (!dense) return
                    setSelectedId(dense.id)
                    onApplyProfile({
                      ...dense,
                      alwaysOnIds: [...dense.alwaysOnIds],
                      days: cloneProfileDays(dense.days),
                    })
                    onMessage(
                      "success",
                      `Loaded Dense archive cycle (${dense.days.length} days) — autosaving. Restart on Overview when you want it live.`
                    )
                  }}
                />
              }
            >
              Dense archive cycle
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              align="end"
              className="max-w-sm text-left leading-snug"
            >
              Built-in preset: rotate through as much of the catalog as possible
              in a short loop. Not seasonal — Christmas can appear any day; miss
              today and it returns next cycle (~2 weeks). Separates main/post,
              shared NPC spots (Saien, etc.), and hard conflicts. Always-on:
              Under Wonderground + Daily Mission chests / hack limits.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[12rem] flex-1 space-y-1 text-[11px]">
          <span className="text-muted-foreground">Profile</span>
          <select
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={busy}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.builtin ? "★ " : ""}
                {p.name}
                {p.builtin ? " (built-in)" : ""} · {p.days.length}d
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || !selected}
          onClick={applySelected}
        >
          Load into editor
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || !selected || selected.builtin}
          onClick={() => void onOverwrite()}
        >
          Overwrite saved
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
      </div>

      {selected?.description ? (
        <p className="text-[11px] leading-snug text-muted-foreground">
          {selected.description}
        </p>
      ) : null}

      <div className="grid gap-2 border-t border-border/50 pt-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="space-y-1 text-[11px]">
          <span className="text-muted-foreground">Save current loop as</span>
          <Input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Profile name"
            className="h-8 text-xs"
            disabled={busy}
          />
        </label>
        <label className="space-y-1 text-[11px]">
          <span className="text-muted-foreground">Description (optional)</span>
          <Input
            value={saveDescription}
            onChange={(e) => setSaveDescription(e.target.value)}
            placeholder="Short note for GMs"
            className="h-8 text-xs"
            disabled={busy}
          />
        </label>
        <div className="flex items-end">
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
            Save profile
          </Button>
        </div>
      </div>
    </div>
  )
}
