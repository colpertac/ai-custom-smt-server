"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import {
  fetchCharacterEditAccess,
  updateCharacterDigitalize,
  updateCharacterExpertise,
} from "@/features/armory/api"
import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { LevelSlider } from "@/features/armory/components/LevelSlider"
import type {
  CharacterEditState,
  EditableDigitalize,
  EditableExpertise,
} from "@/lib/character-expertise-digi-shared"
import {
  DIGITALIZE_LEVEL_MAX,
  GUARDIAN_RACE_LNC_SURFACE_CLASS,
  getGuardianRaceLnc,
  guardianRaceLncSortKey,
} from "@/lib/character-expertise-digi-shared"
import { cn } from "@/lib/utils"

export function ArmoryOwnerEditPanel({ characterName }: { characterName: string }) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const accessQuery = useQuery({
    queryKey: ["armory", "edit-access", characterName],
    queryFn: () => fetchCharacterEditAccess(characterName),
    retry: false,
  })

  const expertiseMutation = useMutation({
    mutationFn: (updates: Parameters<typeof updateCharacterExpertise>[1]) =>
      updateCharacterExpertise(characterName, updates),
    onSuccess: (data) => {
      setError(null)
      void queryClient.setQueryData(
        ["armory", "edit-access", characterName],
        (prev: unknown) => {
          if (!prev || typeof prev !== "object") return prev
          return { ...prev, state: data.state, online: false }
        }
      )
      router.refresh()
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Expertise update failed")
    },
  })

  const digiMutation = useMutation({
    mutationFn: (updates: Parameters<typeof updateCharacterDigitalize>[1]) =>
      updateCharacterDigitalize(characterName, updates),
    onSuccess: (data) => {
      setError(null)
      void queryClient.setQueryData(
        ["armory", "edit-access", characterName],
        (prev: unknown) => {
          if (!prev || typeof prev !== "object") return prev
          return { ...prev, state: data.state, online: false }
        }
      )
      router.refresh()
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Digi update failed")
    },
  })

  if (accessQuery.isLoading) return null
  if (accessQuery.isError || !accessQuery.data?.canEdit) return null

  const { online, state } = accessQuery.data
  if (!state) return null

  const busy = expertiseMutation.isPending || digiMutation.isPending

  return (
    <section className="mb-6 border-2 border-border bg-card/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-sm font-semibold tracking-wide uppercase">
            Owner edit
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Change expertise class/rank and digi levels. Log out of the game
            client before saving.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">
            Edit
          </span>
          <Switch
            checked={editing}
            disabled={busy || online}
            onCheckedChange={setEditing}
            aria-label="Toggle expertise and digi editor"
          />
        </div>
      </div>

      {online ? (
        <p className="mt-3 text-sm text-[#ff9b9b]">
          This character is online — log out of the game, then refresh.
        </p>
      ) : null}
      {error ? (
        <div className="mt-3">
          <FormAlert>{error}</FormAlert>
        </div>
      ) : null}

      {editing && !online ? (
        <div className="mt-4 space-y-6">
          <ExpertiseEditor
            key={`exp-${state.expertises.map((e) => `${e.id}:${e.points}`).join(",")}`}
            state={state}
            busy={busy}
            onSave={(updates) => expertiseMutation.mutate(updates)}
            onMaxAll={() =>
              expertiseMutation.mutate(
                state.expertises.map((e) => ({
                  expertiseId: e.id,
                  classLevel: e.maxClass,
                  rank: e.maxRank,
                }))
              )
            }
          />
          <DigitalizeEditor
            key={`digi-${state.digitalize.map((d) => `${d.raceId}:${d.level}`).join(",")}`}
            rows={state.digitalize}
            busy={busy}
            onSave={(updates) => digiMutation.mutate(updates)}
            onUnlockAll={() =>
              digiMutation.mutate(
                state.digitalize.map((d) => ({
                  raceId: d.raceId,
                  level: Math.max(1, d.level),
                }))
              )
            }
            onMaxAll={() =>
              digiMutation.mutate(
                state.digitalize.map((d) => ({
                  raceId: d.raceId,
                  level: DIGITALIZE_LEVEL_MAX,
                }))
              )
            }
          />
        </div>
      ) : null}
    </section>
  )
}

function ExpertiseEditor({
  state,
  busy,
  onSave,
  onMaxAll,
}: {
  state: CharacterEditState
  busy: boolean
  onSave: (
    updates: Array<{ expertiseId: number; classLevel: number; rank: number }>
  ) => void
  onMaxAll: () => void
}) {
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(
      state.expertises.map((e) => [
        e.id,
        { classLevel: e.classLevel, rank: e.rank },
      ])
    )
  )

  const dirty = useMemo(() => {
    return state.expertises.some((e) => {
      const d = draft[e.id]
      if (!d) return false
      return d.classLevel !== e.classLevel || d.rank !== e.rank
    })
  }, [draft, state.expertises])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Expertises
        </h3>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onMaxAll}
          >
            Max all
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || !dirty}
            onClick={() =>
              onSave(
                state.expertises.map((e) => ({
                  expertiseId: e.id,
                  classLevel: draft[e.id]?.classLevel ?? e.classLevel,
                  rank: draft[e.id]?.rank ?? e.rank,
                }))
              )
            }
          >
            {busy ? "Saving…" : "Save expertises"}
          </Button>
        </div>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {state.expertises.map((e) => (
          <ExpertiseDraftRow
            key={e.id}
            expertise={e}
            classLevel={draft[e.id]?.classLevel ?? e.classLevel}
            rank={draft[e.id]?.rank ?? e.rank}
            disabled={busy}
            onChange={(next) =>
              setDraft((prev) => ({ ...prev, [e.id]: next }))
            }
          />
        ))}
      </div>
    </div>
  )
}

function rankMaxForClass(
  classLevel: number,
  maxClass: number,
  maxRank: number
): number {
  if (classLevel < maxClass) return 9
  return Math.max(0, maxRank)
}

function ExpertiseDraftRow({
  expertise: e,
  classLevel,
  rank,
  disabled,
  onChange,
}: {
  expertise: EditableExpertise
  classLevel: number
  rank: number
  disabled: boolean
  onChange: (next: { classLevel: number; rank: number }) => void
}) {
  const rankMax = rankMaxForClass(classLevel, e.maxClass, e.maxRank)

  return (
    <div className="border border-border/80 px-2.5 py-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">{e.name}</span>
        <span className="text-[10px] text-muted-foreground">
          max C{e.maxClass}
          {e.maxRank > 0 ? ` R${e.maxRank}` : ""}
        </span>
      </div>
      <div className="mt-2 space-y-2">
        <LevelSlider
          label="Class"
          value={classLevel}
          min={0}
          max={e.maxClass}
          disabled={disabled}
          onChange={(nextClass) => {
            const nextRankMax = rankMaxForClass(
              nextClass,
              e.maxClass,
              e.maxRank
            )
            onChange({
              classLevel: nextClass,
              rank: Math.min(rank, nextRankMax),
            })
          }}
        />
        <LevelSlider
          label="Rank"
          value={Math.min(rank, rankMax)}
          min={0}
          max={rankMax}
          disabled={disabled || rankMax <= 0}
          onChange={(nextRank) =>
            onChange({ classLevel, rank: nextRank })
          }
        />
      </div>
    </div>
  )
}

function DigitalizeEditor({
  rows,
  busy,
  onSave,
  onUnlockAll,
  onMaxAll,
}: {
  rows: EditableDigitalize[]
  busy: boolean
  onSave: (updates: Array<{ raceId: number; level: number }>) => void
  onUnlockAll: () => void
  onMaxAll: () => void
}) {
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(rows.map((r) => [r.raceId, r.level]))
  )

  const dirty = useMemo(() => {
    return rows.some((r) => (draft[r.raceId] ?? 0) !== r.level)
  }, [draft, rows])

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const lncDiff =
        guardianRaceLncSortKey(getGuardianRaceLnc(a.raceId)) -
        guardianRaceLncSortKey(getGuardianRaceLnc(b.raceId))
      if (lncDiff !== 0) return lncDiff
      return a.name.localeCompare(b.name)
    })
  }, [rows])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Digi levels
        </h3>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onUnlockAll}
          >
            Unlock all
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onMaxAll}
          >
            Max all
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || !dirty}
            onClick={() =>
              onSave(
                rows.map((r) => ({
                  raceId: r.raceId,
                  level: draft[r.raceId] ?? 0,
                }))
              )
            }
          >
            {busy ? "Saving…" : "Save digi"}
          </Button>
        </div>
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        GM-style force: unlock requirements ignored. Cap is{" "}
        {DIGITALIZE_LEVEL_MAX} (0 = off). Card tint: Law / Neutral / Chaos.
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {sortedRows.map((r) => {
          const level = draft[r.raceId] ?? 0
          const lnc = getGuardianRaceLnc(r.raceId)
          return (
            <div
              key={r.raceId}
              className={cn(
                "border border-border/80 px-2.5 py-2 text-xs",
                GUARDIAN_RACE_LNC_SURFACE_CLASS[lnc]
              )}
              title={`${lnc[0]!.toUpperCase()}${lnc.slice(1)} tribe`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">{r.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {level > 0 ? "on" : "off"} · #{r.raceId}
                </span>
              </div>
              <LevelSlider
                label="Level"
                value={level}
                min={0}
                max={DIGITALIZE_LEVEL_MAX}
                disabled={busy}
                valueLabel={level === 0 ? "off" : String(level)}
                onChange={(next) =>
                  setDraft((prev) => ({ ...prev, [r.raceId]: next }))
                }
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
