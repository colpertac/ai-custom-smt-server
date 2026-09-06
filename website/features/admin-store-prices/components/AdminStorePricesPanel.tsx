"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, ShoppingCart, Trash2 } from "lucide-react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  deleteStoreOverride,
  fetchStoreCartSettings,
  fetchStoreFormula,
  fetchStoreOverrides,
  previewStorePrice,
  saveStoreCartSettings,
  saveStoreFormula,
  upsertStoreOverride,
  type AdminPricePreview,
} from "@/features/admin-store-prices/api"
import type { StorePriceFormula } from "@/lib/store-pricing"

export function AdminStorePricesPanel() {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<StorePriceFormula | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [newWeightKey, setNewWeightKey] = useState("")
  const [overrideItemId, setOverrideItemId] = useState("")
  const [overrideCp, setOverrideCp] = useState("")
  const [overrideNote, setOverrideNote] = useState("")

  const [previewId, setPreviewId] = useState("")
  const [preview, setPreview] = useState<AdminPricePreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const settingsQuery = useQuery({
    queryKey: ["admin-store-settings"],
    queryFn: fetchStoreCartSettings,
  })
  const formulaQuery = useQuery({
    queryKey: ["admin-store-formula"],
    queryFn: fetchStoreFormula,
  })
  const overridesQuery = useQuery({
    queryKey: ["admin-store-overrides"],
    queryFn: fetchStoreOverrides,
  })

  const formula = draft ?? formulaQuery.data?.formula ?? null
  const overrides = overridesQuery.data?.overrides ?? []
  const cartEnabled = settingsQuery.data?.cartEnabled ?? true

  const weightKeys = useMemo(() => {
    if (!formula) return []
    const known = formulaQuery.data?.knownStatIds ?? []
    const keys = new Set([...known, ...Object.keys(formula.weights)])
    return [...keys].sort()
  }, [formula, formulaQuery.data?.knownStatIds])

  const settingsMutation = useMutation({
    mutationFn: saveStoreCartSettings,
    onSuccess: (result) => {
      queryClient.setQueryData(["admin-store-settings"], result)
      setSaveMessage(
        result.cartEnabled
          ? "Web store cart enabled for players."
          : "Web store cart hidden from players."
      )
      setSaveError(null)
    },
    onError: (err: Error) => {
      setSaveError(err.message || "Failed to update cart setting")
      setSaveMessage(null)
    },
  })

  const saveFormulaMutation = useMutation({
    mutationFn: saveStoreFormula,
    onSuccess: (result) => {
      setDraft(null)
      queryClient.setQueryData(["admin-store-formula"], result)
      setSaveMessage("Formula saved.")
      setSaveError(null)
    },
    onError: (err: Error) => {
      setSaveError(err.message || "Save failed")
      setSaveMessage(null)
    },
  })

  const upsertOverrideMutation = useMutation({
    mutationFn: upsertStoreOverride,
    onSuccess: async () => {
      setOverrideItemId("")
      setOverrideCp("")
      setOverrideNote("")
      setSaveMessage("Override saved.")
      setSaveError(null)
      await queryClient.invalidateQueries({ queryKey: ["admin-store-overrides"] })
    },
    onError: (err: Error) => {
      setSaveError(err.message || "Override failed")
      setSaveMessage(null)
    },
  })

  const deleteOverrideMutation = useMutation({
    mutationFn: deleteStoreOverride,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-store-overrides"] })
    },
    onError: (err: Error) => {
      setSaveError(err.message || "Delete failed")
    },
  })

  const pending =
    saveFormulaMutation.isPending ||
    upsertOverrideMutation.isPending ||
    deleteOverrideMutation.isPending ||
    settingsMutation.isPending

  function updateDraft(next: StorePriceFormula) {
    setDraft(next)
  }

  async function handlePreview() {
    const itemId = Number(previewId)
    if (!Number.isInteger(itemId) || itemId <= 0) {
      setPreviewError("Enter a valid item id")
      return
    }
    setPreviewError(null)
    try {
      setPreview(await previewStorePrice(itemId))
    } catch (err) {
      setPreview(null)
      setPreviewError(err instanceof Error ? err.message : "Preview failed")
    }
  }

  if (formulaQuery.isError) {
    return (
      <FormAlert variant="error">
        {formulaQuery.error instanceof Error
          ? formulaQuery.error.message
          : "Failed to load"}
      </FormAlert>
    )
  }
  if (!formula) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  return (
    <div className="space-y-4">
      {saveError ? <FormAlert variant="error">{saveError}</FormAlert> : null}
      {saveMessage ? (
        <FormAlert variant="success">{saveMessage}</FormAlert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-muted/25 px-3 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <ShoppingCart
            className="mt-0.5 size-4 shrink-0 text-gold-dim"
            aria-hidden
          />
          <div>
            <p className="text-sm font-medium">Player web store</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              When off, hides the header cart and wiki “Add to cart” panel.
              Checkout is blocked server-side.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label
            htmlFor="store-cart-enabled"
            className="cursor-pointer text-xs font-medium uppercase tracking-wider text-muted-foreground select-none"
          >
            {cartEnabled ? "Enabled" : "Disabled"}
          </label>
          <Switch
            id="store-cart-enabled"
            checked={cartEnabled}
            disabled={settingsQuery.isLoading || settingsMutation.isPending}
            onCheckedChange={(checked) => settingsMutation.mutate(checked)}
          />
        </div>
      </div>

      <Tabs defaultValue="formula">
        <TabsList variant="line">
          <TabsTrigger value="formula">Formula</TabsTrigger>
          <TabsTrigger value="overrides">Overrides</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="formula" className="space-y-4 pt-3">
          <p className="text-xs text-muted-foreground">
            CP = clamp(round(categoryBase + level×levelWeight + Σ
            stat×weight)). Overrides always win when set.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field>
              <FieldLabel>Min CP</FieldLabel>
              <Input
                type="number"
                value={formula.minCp}
                onChange={(e) =>
                  updateDraft({ ...formula, minCp: Number(e.target.value) })
                }
              />
            </Field>
            <Field>
              <FieldLabel>Max CP</FieldLabel>
              <Input
                type="number"
                value={formula.maxCp}
                onChange={(e) =>
                  updateDraft({ ...formula, maxCp: Number(e.target.value) })
                }
              />
            </Field>
            <Field>
              <FieldLabel>Level weight</FieldLabel>
              <Input
                type="number"
                step="0.1"
                value={formula.levelWeight}
                onChange={(e) =>
                  updateDraft({
                    ...formula,
                    levelWeight: Number(e.target.value),
                  })
                }
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["weapons", "armor", "items"] as const).map((cat) => (
              <Field key={cat}>
                <FieldLabel>Base · {cat}</FieldLabel>
                <Input
                  type="number"
                  value={formula.categoryBase[cat]}
                  onChange={(e) =>
                    updateDraft({
                      ...formula,
                      categoryBase: {
                        ...formula.categoryBase,
                        [cat]: Number(e.target.value),
                      },
                    })
                  }
                />
              </Field>
            ))}
          </div>

          <div>
            <h3 className="font-heading text-xs uppercase tracking-wider text-muted-foreground">
              Stat weights
            </h3>
            <div className="mt-2 max-h-80 overflow-auto border border-border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-muted/80 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Stat</th>
                    <th className="px-2 py-1.5 font-medium">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {weightKeys.map((key) => (
                    <tr key={key} className="border-t border-border/60">
                      <td className="px-2 py-1 font-mono text-xs">{key}</td>
                      <td className="px-2 py-1">
                        <Input
                          type="number"
                          step="0.01"
                          className="h-8 w-28"
                          value={formula.weights[key] ?? 0}
                          onChange={(e) =>
                            updateDraft({
                              ...formula,
                              weights: {
                                ...formula.weights,
                                [key]: Number(e.target.value),
                              },
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <Field className="w-40">
                <FieldLabel>Add weight key</FieldLabel>
                <Input
                  value={newWeightKey}
                  onChange={(e) => setNewWeightKey(e.target.value)}
                  placeholder="STAT_ID"
                />
              </Field>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const key = newWeightKey.trim()
                  if (!key) return
                  updateDraft({
                    ...formula,
                    weights: { ...formula.weights, [key]: 0 },
                  })
                  setNewWeightKey("")
                }}
              >
                <Plus className="size-3.5" />
                Add
              </Button>
            </div>
          </div>

          <Button
            type="button"
            disabled={pending}
            onClick={() => saveFormulaMutation.mutate(formula)}
            className="uppercase tracking-wider"
          >
            {saveFormulaMutation.isPending ? "Saving…" : "Save formula"}
          </Button>
        </TabsContent>

        <TabsContent value="overrides" className="space-y-4 pt-3">
          <FieldGroup className="grid gap-3 sm:grid-cols-4">
            <Field>
              <FieldLabel>Item ID</FieldLabel>
              <Input
                value={overrideItemId}
                onChange={(e) => setOverrideItemId(e.target.value)}
                placeholder="1201"
              />
            </Field>
            <Field>
              <FieldLabel>CP</FieldLabel>
              <Input
                type="number"
                value={overrideCp}
                onChange={(e) => setOverrideCp(e.target.value)}
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel>Note</FieldLabel>
              <Input
                value={overrideNote}
                onChange={(e) => setOverrideNote(e.target.value)}
                placeholder="Optional"
              />
            </Field>
          </FieldGroup>
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => {
              const itemId = Number(overrideItemId)
              const cp = Number(overrideCp)
              if (!Number.isInteger(itemId) || itemId <= 0) {
                setSaveError("Enter a valid item id")
                return
              }
              if (!Number.isInteger(cp) || cp < 0) {
                setSaveError("Enter a valid CP amount")
                return
              }
              upsertOverrideMutation.mutate({
                itemId,
                cp,
                note: overrideNote,
              })
            }}
            className="uppercase tracking-wider"
          >
            Save override
          </Button>

          {overrides.length === 0 ? (
            <p className="text-sm text-muted-foreground">No overrides yet.</p>
          ) : (
            <div className="overflow-x-auto border border-border">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 font-medium">CP</th>
                    <th className="px-3 py-2 font-medium">Note</th>
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {overrides.map((row) => (
                    <tr
                      key={row.itemId}
                      className="border-b border-border/70 last:border-0"
                    >
                      <td className="px-3 py-2">
                        <div>{row.name ?? "Unknown"}</div>
                        <div className="font-mono text-[0.65rem] text-muted-foreground">
                          #{row.itemId}
                        </div>
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {row.cp.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {row.note || "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            deleteOverrideMutation.mutate(row.itemId)
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="preview" className="space-y-4 pt-3">
          <div className="flex flex-wrap items-end gap-2">
            <Field className="w-40">
              <FieldLabel>Item ID</FieldLabel>
              <Input
                value={previewId}
                onChange={(e) => setPreviewId(e.target.value)}
                placeholder="1201"
              />
            </Field>
            <Button
              type="button"
              size="sm"
              onClick={() => void handlePreview()}
              className="uppercase tracking-wider"
            >
              Preview
            </Button>
          </div>
          {previewError ? (
            <FormAlert variant="error">{previewError}</FormAlert>
          ) : null}
          {preview ? (
            <div className="space-y-2 border border-border bg-card/40 p-3 text-sm">
              <p>
                <span className="font-medium">{preview.name}</span>{" "}
                <span className="font-mono text-xs text-muted-foreground">
                  #{preview.itemId}
                </span>
              </p>
              <p>
                Final:{" "}
                <span className="font-medium tabular-nums">
                  {preview.cp.toLocaleString()} CP
                </span>{" "}
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  ({preview.source}
                  {preview.sellable ? "" : " · not sellable"})
                </span>
              </p>
              {preview.reason ? (
                <p className="text-xs text-muted-foreground">{preview.reason}</p>
              ) : null}
              {preview.breakdown ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-muted-foreground uppercase tracking-wider">
                      <tr>
                        <th className="py-1 pr-2">Term</th>
                        <th className="py-1 pr-2">Value</th>
                        <th className="py-1 pr-2">Weight</th>
                        <th className="py-1">CP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.breakdown.terms.map((t) => (
                        <tr
                          key={`${t.kind}-${t.id}`}
                          className="border-t border-border/50"
                        >
                          <td className="py-1 pr-2">{t.label}</td>
                          <td className="py-1 pr-2 tabular-nums">{t.value}</td>
                          <td className="py-1 pr-2 tabular-nums">{t.weight}</td>
                          <td className="py-1 tabular-nums">
                            {t.contribution.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Raw {preview.breakdown.raw.toFixed(2)} → clamped{" "}
                    {preview.breakdown.clamped}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Override — formula breakdown not applied.
                </p>
              )}
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  )
}
