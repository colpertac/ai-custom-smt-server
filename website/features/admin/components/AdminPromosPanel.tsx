"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Plus, Trash2 } from "lucide-react"

import { useConfirm } from "@/components/confirm-dialog"
import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  createAdminPromo,
  deleteAdminPromo,
  fetchAdminPromos,
  lookupShopProducts,
  type AdminPromoItem,
  type AdminPromoRow,
} from "@/features/admin/promos-api"
import type { PromoLimitType } from "@/lib/comp-api"

/** Matches client Promotion Code field (Verify stays disabled until valid). */
const PROMO_CODE_LENGTH = 16
const PROMO_CODE_PATTERN = /^[A-Za-z]{16}$/

const LIMIT_TYPES: { value: PromoLimitType; label: string }[] = [
  { value: "account", label: "Per account" },
  { value: "character", label: "Per character" },
  { value: "world", label: "Per world" },
]

function toDatetimeLocalValue(unixSec: number): string {
  if (!unixSec) return ""
  const d = new Date(unixSec * 1000)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromDatetimeLocalValue(value: string): number {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 0
  return Math.floor(d.getTime() / 1000)
}

function formatWindow(start: number, end: number): string {
  const fmt = (n: number) => {
    const d = new Date(n * 1000)
    if (Number.isNaN(d.getTime())) return String(n)
    return d.toLocaleString()
  }
  return `${fmt(start)} → ${fmt(end)}`
}

function productLabel(item: AdminPromoRow["items"][number]): string {
  const name = item.preview?.name?.trim()
  if (name) return `${item.productId} · ${name}`
  return String(item.productId)
}

function previewLabel(preview: AdminPromoItem["preview"]): string {
  if (!preview) return "—"
  const name = preview.name?.trim()
  if (name) return name
  return `item ${preview.itemId}`
}

function currencyLabel(preview: AdminPromoItem["preview"]): string {
  if (!preview) return "?"
  return preview.isCp ? "CP" : "Macca"
}

function defaultEndLocal(): string {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return toDatetimeLocalValue(Math.floor(d.getTime() / 1000))
}

function defaultStartLocal(): string {
  return toDatetimeLocalValue(Math.floor(Date.now() / 1000))
}

function emptyProductRow(): AdminPromoItem {
  return { productId: 1, preview: null }
}

export function AdminPromosPanel() {
  const confirm = useConfirm()
  const [promos, setPromos] = useState<AdminPromoRow[]>([])
  const [extractPresent, setExtractPresent] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingCode, setDeletingCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const [code, setCode] = useState("")
  const [startLocal, setStartLocal] = useState(defaultStartLocal)
  const [endLocal, setEndLocal] = useState(defaultEndLocal)
  const [useLimit, setUseLimit] = useState(1)
  const [limitType, setLimitType] = useState<PromoLimitType>("account")
  const [productRows, setProductRows] = useState<AdminPromoItem[]>([
    emptyProductRow(),
  ])
  const previewGen = useRef(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAdminPromos()
      setPromos(data.promos)
      setExtractPresent(data.productExtractPresent)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load promos")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const productIdsKey = productRows.map((r) => r.productId).join(",")

  const refreshPreviews = useCallback(async (ids: number[]) => {
    const gen = ++previewGen.current
    const valid = ids.filter((n) => Number.isInteger(n) && n > 0)
    try {
      const data = await lookupShopProducts(valid)
      if (gen !== previewGen.current) return
      setExtractPresent(data.productExtractPresent)
      const byId = new Map(
        data.products.map((p) => [p.productId, p.preview] as const)
      )
      setProductRows((prev) =>
        prev.map((row) => ({
          ...row,
          preview: byId.get(row.productId) ?? null,
        }))
      )
    } catch {
      /* keep prior previews */
    }
  }, [])

  useEffect(() => {
    const ids = productIdsKey
      .split(",")
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n))
    const t = window.setTimeout(() => {
      void refreshPreviews(ids)
    }, 250)
    return () => window.clearTimeout(t)
  }, [productIdsKey, refreshPreviews])

  const sorted = useMemo(() => {
    return [...promos].sort((a, b) => {
      const byCode = a.code.localeCompare(b.code)
      if (byCode !== 0) return byCode
      return b.startTime - a.startTime
    })
  }, [promos])

  const create = async () => {
    const trimmed = code.trim()
    if (!PROMO_CODE_PATTERN.test(trimmed)) {
      setError(
        `Code must be exactly ${PROMO_CODE_LENGTH} letters (A–Z only; no numbers, spaces, or symbols)`
      )
      setOk(null)
      return
    }
    const startTime = fromDatetimeLocalValue(startLocal)
    const endTime = fromDatetimeLocalValue(endLocal)
    if (!startTime || !endTime) {
      setError("Start and end times are required")
      setOk(null)
      return
    }
    if (endTime < startTime) {
      setError("End time must be on or after start time")
      setOk(null)
      return
    }
    const items = productRows
      .map((r) => r.productId)
      .filter((n) => Number.isInteger(n) && n > 0)
    if (items.length === 0) {
      setError("Add at least one shop product ID")
      setOk(null)
      return
    }

    setSaving(true)
    setError(null)
    setOk(null)
    try {
      const data = await createAdminPromo({
        code: trimmed,
        startTime,
        endTime,
        useLimit,
        limitType,
        items,
      })
      setPromos(data.promos)
      setExtractPresent(data.productExtractPresent)
      setOk(
        data.duplicateWarning
          ? `Created another promo for code "${trimmed}" (code already existed).`
          : `Promo "${trimmed}" created.`
      )
      setCode("")
      setProductRows([emptyProductRow()])
      setUseLimit(1)
      setLimitType("account")
      setStartLocal(defaultStartLocal())
      setEndLocal(defaultEndLocal())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed")
    } finally {
      setSaving(false)
    }
  }

  const remove = async (promoCode: string) => {
    const okConfirm = await confirm({
      title: `Delete promo "${promoCode}"?`,
      description:
        "Deletes all lobby promo rows with this code. Players will no longer be able to redeem it.",
      confirmLabel: "Delete",
      variant: "destructive",
    })
    if (!okConfirm) return

    setDeletingCode(promoCode)
    setError(null)
    setOk(null)
    try {
      const result = await deleteAdminPromo(promoCode)
      setOk(result.message)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed")
    } finally {
      setDeletingCode(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="border border-border/80 bg-muted/20 px-4 py-3">
        <div className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Create promo
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Rewards are shop product IDs (ShopProductData), delivered to Post when
          the player redeems the code in the client Promotion Code window.
        </p>

        {!extractPresent ? (
          <FormAlert className="mt-3" variant="warning">
            shop-products.json missing — run scripts/shop-export-products.sh for
            item previews / soft ProductID checks. Lobby still validates IDs on
            create.
          </FormAlert>
        ) : null}

        <FieldGroup className="mt-3 gap-3">
          <Field>
            <FieldLabel htmlFor="promo-code">Code</FieldLabel>
            <Input
              id="promo-code"
              value={code}
              onChange={(e) => {
                const next = e.target.value
                  .replace(/[^A-Za-z]/g, "")
                  .slice(0, PROMO_CODE_LENGTH)
                setCode(next)
              }}
              placeholder="abcdefghijklmnop"
              maxLength={PROMO_CODE_LENGTH}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={code.length > 0 && !PROMO_CODE_PATTERN.test(code)}
              className="font-mono tracking-wide"
            />
            <p className="mt-1 text-[0.65rem] text-muted-foreground">
              Client requires exactly {PROMO_CODE_LENGTH} letters (A–Z only).{" "}
              <span
                className={
                  code.length === PROMO_CODE_LENGTH
                    ? "text-foreground"
                    : "text-muted-foreground"
                }
              >
                {code.length}/{PROMO_CODE_LENGTH}
              </span>
            </p>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="promo-start">Start</FieldLabel>
              <Input
                id="promo-start"
                type="datetime-local"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="promo-end">End</FieldLabel>
              <Input
                id="promo-end"
                type="datetime-local"
                value={endLocal}
                onChange={(e) => setEndLocal(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="promo-use-limit">Use limit</FieldLabel>
              <Input
                id="promo-use-limit"
                type="number"
                min={0}
                max={255}
                value={useLimit}
                onChange={(e) => setUseLimit(Number(e.target.value) || 0)}
              />
              <p className="mt-1 text-[0.65rem] text-muted-foreground">
                0 = unlimited within the window
              </p>
            </Field>
            <Field>
              <FieldLabel htmlFor="promo-limit-type">Limit type</FieldLabel>
              <select
                id="promo-limit-type"
                value={limitType}
                onChange={(e) =>
                  setLimitType(e.target.value as PromoLimitType)
                }
                className="h-(--density-control-h) w-full rounded-none border border-border bg-background/70 px-(--density-control-px) text-sm outline-none focus-visible:border-gold-dim focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                {LIMIT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field>
            <FieldLabel>Products</FieldLabel>
            <p className="mb-2 text-[0.65rem] text-muted-foreground">
              ProductID is a ShopProductData id (same as Comp shops).
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-1 pr-2 font-medium">ProductID</th>
                    <th className="py-1 pr-2 font-medium">Item</th>
                    <th className="py-1 pr-2 font-medium">Currency</th>
                    <th className="py-1 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {productRows.map((row, pi) => (
                    <tr
                      key={`promo-product-${pi}`}
                      className="border-b border-border/60"
                    >
                      <td className="py-1 pr-2 align-middle">
                        <Input
                          className="h-8 w-28"
                          type="number"
                          min={1}
                          value={row.productId}
                          onChange={(e) => {
                            const productId = Number(e.target.value)
                            setProductRows((prev) => {
                              const next = [...prev]
                              next[pi] = {
                                productId: Number.isFinite(productId)
                                  ? productId
                                  : 0,
                                preview: null,
                              }
                              return next
                            })
                          }}
                        />
                      </td>
                      <td className="max-w-[14rem] truncate py-1 pr-2 align-middle text-xs">
                        {previewLabel(row.preview)}
                      </td>
                      <td className="py-1 pr-2 align-middle text-xs">
                        {currencyLabel(row.preview)}
                      </td>
                      <td className="py-1 align-middle">
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          title="Remove product"
                          className="text-[#ff9b9b] hover:text-[#ffc9c9]"
                          disabled={productRows.length <= 1}
                          onClick={() =>
                            setProductRows((prev) =>
                              prev.filter((_, i) => i !== pi)
                            )
                          }
                        >
                          <Trash2 />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() =>
                setProductRows((prev) => [...prev, emptyProductRow()])
              }
            >
              <Plus data-icon="inline-start" />
              Add product
            </Button>
          </Field>
        </FieldGroup>

        {error ? (
          <FormAlert className="mt-3" variant="error">
            {error}
          </FormAlert>
        ) : null}
        {ok ? (
          <FormAlert className="mt-3" variant="success">
            {ok}
          </FormAlert>
        ) : null}

        <div className="mt-3">
          <Button
            type="button"
            size="sm"
            disabled={saving || !PROMO_CODE_PATTERN.test(code.trim())}
            onClick={() => void create()}
          >
            {saving ? "Creating…" : "Create promo"}
          </Button>
        </div>
      </div>

      <div className="border border-border/80 bg-muted/20 px-4 py-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Existing promos
          </div>
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={loading}
            onClick={() => void load()}
          >
            Refresh
          </Button>
        </div>

        {loading ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
        ) : sorted.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No promos yet.</p>
        ) : (
          <div className="mt-3 max-h-[28rem] overflow-auto border border-border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-muted/80 text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 font-medium">Code</th>
                  <th className="px-2 py-2 font-medium">Window</th>
                  <th className="px-2 py-2 font-medium">Limit</th>
                  <th className="px-2 py-2 font-medium">Products</th>
                  <th className="px-2 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, idx) => (
                  <tr
                    key={`${p.code}-${p.startTime}-${p.endTime}-${idx}`}
                    className="border-t border-border"
                  >
                    <td className="px-2 py-2 font-medium font-mono">
                      {p.code}
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">
                      {formatWindow(p.startTime, p.endTime)}
                    </td>
                    <td className="px-2 py-2">
                      {p.useLimit === 0 ? "∞" : p.useLimit}/{p.limitType}
                    </td>
                    <td className="px-2 py-2">
                      <ul className="space-y-0.5">
                        {p.items.map((item) => (
                          <li key={`${p.code}-${item.productId}-${idx}`}>
                            {productLabel(item)}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Button
                        type="button"
                        size="xs"
                        variant="destructive"
                        disabled={deletingCode === p.code}
                        onClick={() => void remove(p.code)}
                      >
                        {deletingCode === p.code ? "…" : "Delete"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
