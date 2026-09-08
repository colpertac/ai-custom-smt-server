"use client"

import { useEffect, useMemo, useState } from "react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { familyWeightOf } from "@/features/admin-payouts/payout-weights"
import { useSaveAdminFamilyWeights } from "@/features/admin-payouts/hooks"
import { FAMILY_WEIGHTS_SCHEMA_VERSION } from "@/lib/dungeon-payout-types"

export function FamilyWeightsDialog({
  open,
  onOpenChange,
  families,
  savedWeights,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Unique family names from the payout list (already sorted preferred). */
  families: string[]
  savedWeights: Record<string, number>
  onSaved?: () => void
}) {
  const saveMutation = useSaveAdminFamilyWeights()
  const [draft, setDraft] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)

  const sortedFamilies = useMemo(
    () => [...families].sort((a, b) => a.localeCompare(b)),
    [families]
  )

  useEffect(() => {
    if (!open) {
      setDraft({})
      setError(null)
      return
    }
    const next: Record<string, number> = {}
    for (const family of sortedFamilies) {
      next[family] = familyWeightOf(savedWeights, family)
    }
    setDraft(next)
    setError(null)
  }, [open, sortedFamilies, savedWeights])

  const dirty = sortedFamilies.some(
    (family) =>
      (draft[family] ?? 1) !== familyWeightOf(savedWeights, family)
  )

  const onSave = () => {
    setError(null)
    const weights: Record<string, number> = { ...savedWeights }
    for (const family of sortedFamilies) {
      const w = draft[family] ?? 1
      if (!Number.isFinite(w) || w < 0) {
        setError(`Invalid weight for ${family}`)
        return
      }
      if (w === 1) {
        delete weights[family]
      } else {
        weights[family] = w
      }
    }
    // Drop keys for families no longer in the list only if they were 1 — keep
    // orphan keys so renaming a family does not wipe history unexpectedly.
    saveMutation.mutate(
      { version: FAMILY_WEIGHTS_SCHEMA_VERSION, weights },
      {
        onSuccess: () => {
          onSaved?.()
          onOpenChange(false)
        },
        onError: (err) => {
          setError(
            err instanceof Error ? err.message : "Failed to save family weights"
          )
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Family weights</DialogTitle>
          <DialogDescription>
            Multiplies Grindy bronze/silver/gold (and mode bases) on Recalculate.
            Shared across future reward types. One × per dungeon family.
          </DialogDescription>
        </DialogHeader>

        {error ? <FormAlert variant="error">{error}</FormAlert> : null}

        {!sortedFamilies.length ? (
          <p className="text-sm text-muted-foreground">No dungeon families yet.</p>
        ) : (
          <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {sortedFamilies.map((family) => (
              <div
                key={family}
                className="flex items-center gap-3"
              >
                <label
                  htmlFor={`fam-w-${family}`}
                  className="min-w-0 flex-1 truncate text-sm text-foreground"
                  title={family}
                >
                  {family}
                </label>
                <span className="shrink-0 text-xs text-muted-foreground">×</span>
                <Input
                  id={`fam-w-${family}`}
                  className="h-8 w-20 shrink-0 text-center"
                  type="number"
                  min={0}
                  step={0.1}
                  value={draft[family] ?? 1}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      [family]: Number(e.target.value),
                    }))
                  }
                />
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saveMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!dirty || saveMutation.isPending || !sortedFamilies.length}
            onClick={onSave}
          >
            {saveMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
