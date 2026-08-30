"use client"

import { useEffect, useState } from "react"
import { Copy, Pencil, Plus, Trash2 } from "lucide-react"

import { useConfirm } from "@/components/confirm-dialog"
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
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  useCreateAdminCpPreset,
  useDeleteAdminCpPreset,
  useDuplicateAdminCpPreset,
  useRestoreDefaultAdminCpPresets,
  useUpdateAdminCpPreset,
} from "@/features/admin-payouts/hooks"
import type { EconomyPreset } from "@/lib/cp-presets-store"

type FormState = {
  id: string
  label: string
  blurb: string
  bronze: string
  silver: string
  gold: string
  bearcatMult: string
  diaspora: string
  bossMultOfGold: string
  special: string
}

function emptyForm(): FormState {
  return {
    id: "",
    label: "",
    blurb: "",
    bronze: "20",
    silver: "50",
    gold: "120",
    bearcatMult: "1.5",
    diaspora: "200",
    bossMultOfGold: "1.15",
    special: "25",
  }
}

function formFromPreset(p: EconomyPreset): FormState {
  return {
    id: p.id,
    label: p.label,
    blurb: p.blurb,
    bronze: String(p.bronze),
    silver: String(p.silver),
    gold: String(p.gold),
    bearcatMult: String(p.bearcatMult),
    diaspora: String(p.diaspora),
    bossMultOfGold: String(p.bossMultOfGold),
    special: String(p.special),
  }
}

function parseNum(raw: string): number | null {
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export function CpPresetsManageDialog({
  open,
  onOpenChange,
  presets,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  presets: EconomyPreset[]
}) {
  const confirm = useConfirm()
  const createMutation = useCreateAdminCpPreset()
  const updateMutation = useUpdateAdminCpPreset()
  const deleteMutation = useDeleteAdminCpPreset()
  const duplicateMutation = useDuplicateAdminCpPreset()
  const restoreMutation = useRestoreDefaultAdminCpPresets()

  const [mode, setMode] = useState<"list" | "create" | "edit">("list")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setMode("list")
      setEditingId(null)
      setForm(emptyForm())
      setError(null)
    }
  }, [open])

  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    duplicateMutation.isPending ||
    restoreMutation.isPending

  const startCreate = () => {
    setError(null)
    setEditingId(null)
    setForm(emptyForm())
    setMode("create")
  }

  const startEdit = (p: EconomyPreset) => {
    setError(null)
    setEditingId(p.id)
    setForm(formFromPreset(p))
    setMode("edit")
  }

  const saveForm = () => {
    setError(null)
    const bronze = parseNum(form.bronze)
    const silver = parseNum(form.silver)
    const gold = parseNum(form.gold)
    const bearcatMult = parseNum(form.bearcatMult)
    const diaspora = parseNum(form.diaspora)
    const bossMultOfGold = parseNum(form.bossMultOfGold)
    const special = parseNum(form.special)
    if (
      !form.label.trim() ||
      bronze == null ||
      silver == null ||
      gold == null ||
      bearcatMult == null ||
      diaspora == null ||
      bossMultOfGold == null ||
      special == null
    ) {
      setError("Fill label and all numeric fields")
      return
    }
    const body = {
      label: form.label.trim(),
      blurb: form.blurb.trim(),
      bronze,
      silver,
      gold,
      bearcatMult,
      diaspora,
      bossMultOfGold,
      special,
    }
    if (mode === "create") {
      createMutation.mutate(
        { ...body, id: form.id.trim() || undefined },
        {
          onSuccess: () => {
            setMode("list")
            setForm(emptyForm())
          },
          onError: (e) =>
            setError(e instanceof Error ? e.message : "Create failed"),
        }
      )
      return
    }
    if (!editingId) return
    updateMutation.mutate(
      { id: editingId, body },
      {
        onSuccess: () => {
          setMode("list")
          setEditingId(null)
        },
        onError: (e) =>
          setError(e instanceof Error ? e.message : "Save failed"),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>
            {mode === "list"
              ? "CP presets"
              : mode === "create"
                ? "New CP preset"
                : `Edit “${editingId}”`}
          </DialogTitle>
          <DialogDescription>
            {mode === "list"
              ? "Apply presets from the payouts sheet. Duplicate a preset for seasonal events, then tweak the numbers."
              : "Bronze / silver / gold are base CP. Bearcat and boss scale from bronze and gold; diaspora and special are fixed."}
          </DialogDescription>
        </DialogHeader>

        {error ? <FormAlert variant="error">{error}</FormAlert> : null}

        {mode === "list" ? (
          <div className="space-y-2">
            {presets.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No presets yet. Restore built-ins or create one.
              </p>
            ) : (
              <ul className="max-h-72 space-y-1.5 overflow-y-auto">
                {presets.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-start justify-between gap-2 border border-border/80 bg-muted/20 px-2.5 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {p.label}
                      </p>
                      <p className="truncate font-mono text-[0.65rem] text-muted-foreground">
                        {p.id}
                      </p>
                      <p className="mt-0.5 text-[0.7rem] text-muted-foreground">
                        B {p.bronze} · S {p.silver} · G {p.gold}
                        {p.blurb ? ` — ${p.blurb}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        title="Edit"
                        disabled={busy}
                        onClick={() => startEdit(p)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        title="Duplicate"
                        disabled={busy}
                        onClick={() =>
                          duplicateMutation.mutate(
                            { id: p.id },
                            {
                              onError: (e) =>
                                setError(
                                  e instanceof Error
                                    ? e.message
                                    : "Duplicate failed"
                                ),
                            }
                          )
                        }
                      >
                        <Copy className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        title="Delete"
                        disabled={busy}
                        onClick={() => {
                          void (async () => {
                            const ok = await confirm({
                              title: `Delete “${p.label}”?`,
                              description:
                                "This only removes the preset. Payout CP values already saved are unchanged.",
                              confirmLabel: "Delete",
                              variant: "destructive",
                            })
                            if (!ok) return
                            deleteMutation.mutate(p.id, {
                              onError: (e) =>
                                setError(
                                  e instanceof Error
                                    ? e.message
                                    : "Delete failed"
                                ),
                            })
                          })()
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {mode === "create" ? (
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="cp-preset-id">
                  Id (optional kebab-case)
                </FieldLabel>
                <Input
                  id="cp-preset-id"
                  value={form.id}
                  placeholder="halloween-2026"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, id: e.target.value }))
                  }
                />
              </Field>
            ) : null}
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="cp-preset-label">Label</FieldLabel>
              <Input
                id="cp-preset-label"
                value={form.label}
                onChange={(e) =>
                  setForm((f) => ({ ...f, label: e.target.value }))
                }
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="cp-preset-blurb">Blurb</FieldLabel>
              <Input
                id="cp-preset-blurb"
                value={form.blurb}
                onChange={(e) =>
                  setForm((f) => ({ ...f, blurb: e.target.value }))
                }
              />
            </Field>
            {(
              [
                ["bronze", "Bronze"],
                ["silver", "Silver"],
                ["gold", "Gold"],
                ["bearcatMult", "Bearcat ×"],
                ["diaspora", "Diaspora"],
                ["bossMultOfGold", "Boss × gold"],
                ["special", "Special"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key}>
                <FieldLabel htmlFor={`cp-preset-${key}`}>{label}</FieldLabel>
                <Input
                  id={`cp-preset-${key}`}
                  type="number"
                  step="any"
                  min={0}
                  value={form[key]}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [key]: e.target.value }))
                  }
                />
              </Field>
            ))}
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          {mode === "list" ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    const ok = await confirm({
                      title: "Restore built-in presets?",
                      description:
                        "Re-adds or resets Grindy, Normal, and Generous. Custom presets are kept.",
                      confirmLabel: "Restore",
                    })
                    if (!ok) return
                    restoreMutation.mutate(undefined, {
                      onError: (e) =>
                        setError(
                          e instanceof Error ? e.message : "Restore failed"
                        ),
                    })
                  })()
                }}
              >
                Restore built-ins
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={startCreate}
              >
                <Plus data-icon="inline-start" />
                New preset
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setMode("list")
                  setError(null)
                }}
              >
                Back
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={saveForm}
              >
                {busy ? "Saving…" : mode === "create" ? "Create" : "Save"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
