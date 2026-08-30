"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Plus, Trash2 } from "lucide-react"

import {
  downloadAdminShopXml,
  downloadAdminShopsZipAll,
  type ShopDetail,
  type ShopProductRow,
} from "@/features/admin-shops/api"
import { lookupShopProducts } from "@/features/admin/promos-api"
import {
  useAdminShop,
  useAdminShops,
  useCreateAdminShop,
  useDeleteAdminShop,
  useSaveAdminShop,
} from "@/features/admin-shops/hooks"
import { useConfirm } from "@/components/confirm-dialog"
import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { CompShop, CompShopTab } from "@/lib/comp-shop-xml"

function CurrencyBadge({ preview }: { preview: ShopProductRow["preview"] }) {
  if (!preview) {
    return (
      <span
        className="inline-block border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase"
        title="Unknown until ProductID resolves against shop-products.json"
      >
        ?
      </span>
    )
  }
  if (preview.isCp) {
    return (
      <span
        className="inline-block border border-[#6a8cff]/50 bg-[#1a2240] px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#9eb6ff] uppercase"
        title="Sold for CP (item flag in ItemData — not settable in shop XML)"
      >
        CP
      </span>
    )
  }
  return (
    <span
      className="inline-block border border-gold-dim/60 bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-gold-hot uppercase"
      title="Sold for Macca (item flag in ItemData — not settable in shop XML)"
    >
      Macca
    </span>
  )
}

function toSaveBody(draft: ShopDetail): CompShop {
  return {
    shopId: draft.shopId,
    name: draft.name,
    type: draft.type,
    filename: draft.filename,
    passthrough: draft.passthrough,
    tabs: draft.tabs.map(
      (t): CompShopTab => ({
        name: t.name,
        passthrough: t.passthrough,
        products: t.products.map((p) => ({
          productId: p.productId,
          basePrice: p.basePrice,
          merchantDescription: p.merchantDescription,
          moonRestrict: p.moonRestrict,
          passthrough: p.passthrough,
        })),
      })
    ),
  }
}

/** Stable compare key for editable shop fields (ignores previews). */
function shopFingerprint(shop: ShopDetail): string {
  return JSON.stringify(toSaveBody(shop))
}

const UNSAVED_MSG =
  "You have unsaved shop changes. Leave without saving?"

export function CompShopsPanel() {
  const confirm = useConfirm()
  const { data: list, isLoading, isError, error } = useAdminShops()
  const [filter, setFilter] = useState("")
  const [exportPending, setExportPending] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const detailQuery = useAdminShop(selectedId)
  const createMutation = useCreateAdminShop()
  const saveMutation = useSaveAdminShop()
  const deleteMutation = useDeleteAdminShop()
  const [draft, setDraft] = useState<ShopDetail | null>(null)
  const [baseline, setBaseline] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState(0)
  const [newShopId, setNewShopId] = useState("")
  const [newShopName, setNewShopName] = useState("")
  const dirtyRef = useRef(false)
  const loadedShopKey = useRef<string | null>(null)
  const previewGen = useRef(0)

  const isDirty = useMemo(() => {
    if (!draft || baseline == null) return false
    return shopFingerprint(draft) !== baseline
  }, [draft, baseline])

  const productIdsKey = useMemo(() => {
    if (!draft) return ""
    return draft.tabs
      .flatMap((t) => t.products.map((p) => p.productId))
      .join(",")
  }, [draft])

  const refreshPreviews = useCallback(async (ids: number[]) => {
    const gen = ++previewGen.current
    const valid = ids.filter((n) => Number.isInteger(n) && n > 0)
    try {
      const data = await lookupShopProducts(valid)
      if (gen !== previewGen.current) return
      setDraft((prev) => {
        if (!prev) return prev
        const byId = new Map(
          data.products.map((p) => [p.productId, p.preview] as const)
        )
        return {
          ...prev,
          productExtractPresent: data.productExtractPresent,
          tabs: prev.tabs.map((tab) => ({
            ...tab,
            products: tab.products.map((p) => ({
              ...p,
              preview: byId.get(p.productId) ?? null,
            })),
          })),
        }
      })
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

  useEffect(() => {
    dirtyRef.current = isDirty
  }, [isDirty])

  useEffect(() => {
    if (!detailQuery.data) {
      if (selectedId == null) {
        setDraft(null)
        setBaseline(null)
        loadedShopKey.current = null
      }
      return
    }
    if (detailQuery.data.shopId !== selectedId) return
    // Keep in-progress edits if this shop is already loaded.
    if (loadedShopKey.current === String(selectedId)) return
    const next = structuredClone(detailQuery.data)
    setDraft(next)
    setBaseline(shopFingerprint(next))
    setActiveTab(0)
    loadedShopKey.current = String(selectedId)
    saveMutation.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync from server when shop selection loads
  }, [detailQuery.data, selectedId])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [])

  const confirmDiscard = useCallback(async () => {
    if (!dirtyRef.current) return true
    return confirm({
      title: "Discard unsaved changes?",
      description: UNSAVED_MSG,
      confirmLabel: "Discard",
      variant: "destructive",
    })
  }, [confirm])

  const selectShop = useCallback(
    async (shopId: number) => {
      if (shopId === selectedId) return
      if (!(await confirmDiscard())) return
      loadedShopKey.current = null
      setSelectedId(shopId)
    },
    [confirmDiscard, selectedId]
  )

  const nextSuggestedId = useMemo(() => {
    const ids = (list ?? []).map((s) => s.shopId)
    if (!ids.length) return 9000
    return Math.max(...ids) + 1
  }, [list])

  async function runExport(fn: () => Promise<void>) {
    setExportError(null)
    setExportPending(true)
    try {
      await fn()
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Download failed")
    } finally {
      setExportPending(false)
    }
  }

  const shops = useMemo(() => {
    const rows = list ?? []
    const q = filter.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (s) =>
        String(s.shopId).includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.filename.toLowerCase().includes(q)
    )
  }, [list, filter])

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading shops…</p>
  }
  if (isError) {
    return (
      <p className="mt-8 text-sm font-medium text-[#ff9b9b]">
        {error instanceof Error ? error.message : "Failed to load shops"}
      </p>
    )
  }

  const tab = draft?.tabs[activeTab]

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(14rem,0.9fr)_1.4fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">COMP shops</CardTitle>
          <CardDescription>
            Working copy only — download XML to install into channel datastore.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field>
            <FieldLabel htmlFor="shop-filter">Filter</FieldLabel>
            <Input
              id="shop-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="id or name"
            />
          </Field>
          <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-0.5 text-sm">
            {shops.map((s) => {
              const selected = selectedId === s.shopId
              return (
                <div
                  key={s.shopId}
                  className={`flex items-stretch gap-1 border-2 transition-colors ${
                    selected
                      ? "border-gold-dim bg-muted/80"
                      : "border-border bg-background/40 hover:border-gold-dim/70 hover:bg-muted/40"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectShop(s.shopId)}
                    className="flex min-w-0 flex-1 flex-col px-2.5 py-2 text-left"
                  >
                    <span className="truncate font-medium">
                      {s.shopId} — {s.name}
                      {selected && isDirty ? " *" : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {s.tabCount} tabs · {s.productCount} products
                    </span>
                  </button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Delete shop ${s.shopId}`}
                    title="Delete shop"
                    className="mr-1 shrink-0 self-center text-[#ff9b9b] hover:bg-[#3a1010] hover:text-[#ffc9c9]"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      void (async () => {
                        if (
                          selectedId === s.shopId &&
                          !(await confirmDiscard())
                        ) {
                          return
                        }
                        const ok = await confirm({
                          title: "Delete this shop?",
                          description: `Working-copy shop ${s.shopId} (${s.name}) will be removed.`,
                          confirmLabel: "Delete",
                          variant: "destructive",
                        })
                        if (!ok) return
                        deleteMutation.reset()
                        deleteMutation.mutate(s.shopId, {
                          onSuccess: () => {
                            if (selectedId === s.shopId) {
                              setSelectedId(null)
                              setDraft(null)
                              setBaseline(null)
                              loadedShopKey.current = null
                            }
                          },
                        })
                      })()
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )
            })}
            {!shops.length && (
              <p className="border-2 border-dashed border-border px-3 py-4 text-muted-foreground">
                No shops yet. Create one below, or run{" "}
                <code className="text-xs">scripts/shop-seed-working-copy.sh</code>
                .
              </p>
            )}
          </div>

          <div className="space-y-2 border-2 border-border bg-muted/20 p-3">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              New shop
            </p>
            <FieldGroup className="gap-2">
              <Field>
                <FieldLabel htmlFor="new-shop-id">Shop ID</FieldLabel>
                <Input
                  id="new-shop-id"
                  type="number"
                  min={1}
                  value={newShopId}
                  placeholder={String(nextSuggestedId)}
                  onChange={(e) => setNewShopId(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-shop-name">Name</FieldLabel>
                <Input
                  id="new-shop-name"
                  value={newShopName}
                  placeholder="COMP shop name"
                  onChange={(e) => setNewShopName(e.target.value)}
                />
              </Field>
            </FieldGroup>
            {createMutation.isError && (
              <FormAlert variant="error">
                {createMutation.error instanceof Error
                  ? createMutation.error.message
                  : "Create failed"}
              </FormAlert>
            )}
            {deleteMutation.isError && (
              <FormAlert variant="error">
                {deleteMutation.error instanceof Error
                  ? deleteMutation.error.message
                  : "Delete failed"}
              </FormAlert>
            )}
            <Button
              type="button"
              size="sm"
              disabled={createMutation.isPending}
              onClick={() => {
                void (async () => {
                  if (!(await confirmDiscard())) return
                  const shopId = Number.parseInt(
                    newShopId.trim() || String(nextSuggestedId),
                    10
                  )
                  const name = newShopName.trim() || `Shop ${shopId}`
                  if (!Number.isInteger(shopId) || shopId <= 0) return
                  createMutation.reset()
                  createMutation.mutate(
                    { shopId, name },
                    {
                      onSuccess: (data) => {
                        setNewShopId("")
                        setNewShopName("")
                        loadedShopKey.current = null
                        setSelectedId(data.shopId)
                      },
                    }
                  )
                })()
              }}
            >
              <Plus data-icon="inline-start" />
              {createMutation.isPending ? "Creating…" : "Create shop"}
            </Button>
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={exportPending}
            onClick={() => void runExport(() => downloadAdminShopsZipAll())}
          >
            {exportPending ? "Downloading…" : "Download all (zip)"}
          </Button>
          {exportError && <FormAlert variant="error">{exportError}</FormAlert>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {draft ? `Edit shop ${draft.shopId}` : "Select a shop"}
            {isDirty ? (
              <span className="ml-2 text-sm font-normal text-gold-hot">
                Unsaved
              </span>
            ) : null}
          </CardTitle>
          <CardDescription>
            {draft
              ? `${draft.filename} — currency (Macca/CP) is fixed by the item, not the shop.`
              : "ProductID is a ShopProductData id; Macca vs CP comes from the item flag."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!selectedId && (
            <p className="text-sm text-muted-foreground">
              Choose a shop from the list.
            </p>
          )}
          {selectedId && detailQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Loading shop…</p>
          )}
          {selectedId && detailQuery.isError && (
            <p className="text-sm font-medium text-[#ff9b9b]">
              {detailQuery.error instanceof Error
                ? detailQuery.error.message
                : "Failed to load shop"}
            </p>
          )}
          {draft && tab && (
            <div className="space-y-4">
              {isDirty && (
                <FormAlert variant="error">
                  Unsaved changes — save before switching shops or leaving this
                  page.
                </FormAlert>
              )}
              {!draft.productExtractPresent && (
                <FormAlert variant="error">
                  shop-products.json missing — run scripts/shop-export-products.sh
                  for item previews / soft ProductID checks.
                </FormAlert>
              )}
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="shop-name">Name</FieldLabel>
                  <Input
                    id="shop-name"
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                  />
                </Field>
              </FieldGroup>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Tabs</span>
                {draft.tabs.map((t, i) => (
                  <Button
                    key={`${t.name}-${i}`}
                    type="button"
                    size="sm"
                    variant={i === activeTab ? "default" : "outline"}
                    onClick={() => setActiveTab(i)}
                  >
                    {t.name || `Tab ${i + 1}`}
                  </Button>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  title="Add tab"
                  onClick={() => {
                    setDraft({
                      ...draft,
                      tabs: [
                        ...draft.tabs,
                        { name: "New tab", products: [], passthrough: [] },
                      ],
                    })
                    setActiveTab(draft.tabs.length)
                  }}
                >
                  <Plus data-icon="inline-start" />
                  Add tab
                </Button>
                {draft.tabs.length > 1 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    title="Remove current tab"
                    className="text-[#ff9b9b] hover:text-[#ffc9c9]"
                    onClick={() => {
                      const tabs = draft.tabs.filter((_, i) => i !== activeTab)
                      setDraft({ ...draft, tabs })
                      setActiveTab(Math.max(0, activeTab - 1))
                    }}
                  >
                    <Trash2 data-icon="inline-start" />
                    Remove tab
                  </Button>
                )}
              </div>

              <Field>
                <FieldLabel htmlFor="tab-name">Tab name</FieldLabel>
                <Input
                  id="tab-name"
                  value={tab.name}
                  onChange={(e) => {
                    const tabs = [...draft.tabs]
                    tabs[activeTab] = { ...tab, name: e.target.value }
                    setDraft({ ...draft, tabs })
                  }}
                />
              </Field>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="py-1 pr-2 font-medium">ProductID</th>
                      <th className="py-1 pr-2 font-medium">Item</th>
                      <th className="py-1 pr-2 font-medium">Currency</th>
                      <th className="py-1 pr-2 font-medium">BasePrice</th>
                      <th className="py-1 pr-2 font-medium" title="u8 string-table id">
                        Desc ID
                      </th>
                      <th className="py-1 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {tab.products.map((p, pi) => (
                      <tr
                        key={`tab-${activeTab}-product-${pi}`}
                        className="border-b border-border/60"
                      >
                        <td className="py-1 pr-2 align-middle">
                          <Input
                            className="h-8 w-24"
                            type="number"
                            value={p.productId}
                            onChange={(e) => {
                              const productId = Number(e.target.value)
                              const products = [...tab.products]
                              products[pi] = {
                                ...p,
                                productId,
                                preview: null,
                              }
                              const tabs = [...draft.tabs]
                              tabs[activeTab] = { ...tab, products }
                              setDraft({ ...draft, tabs })
                            }}
                          />
                        </td>
                        <td className="max-w-[10rem] truncate py-1 pr-2 align-middle text-xs">
                          {p.preview?.name ??
                            (p.preview ? `item ${p.preview.itemId}` : "—")}
                        </td>
                        <td className="py-1 pr-2 align-middle">
                          <CurrencyBadge preview={p.preview} />
                        </td>
                        <td className="py-1 pr-2 align-middle">
                          <div className="flex items-center gap-1.5">
                            <Input
                              className="h-8 w-24"
                              type="number"
                              value={p.basePrice}
                              onChange={(e) => {
                                const basePrice = Number(e.target.value)
                                const products = [...tab.products]
                                products[pi] = { ...p, basePrice }
                                const tabs = [...draft.tabs]
                                tabs[activeTab] = { ...tab, products }
                                setDraft({ ...draft, tabs })
                              }}
                            />
                            <span className="shrink-0 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                              {p.preview
                                ? p.preview.isCp
                                  ? "CP"
                                  : "Macca"
                                : "—"}
                            </span>
                          </div>
                        </td>
                        <td className="py-1 pr-2 align-middle">
                          <Input
                            className="h-8 w-20"
                            type="number"
                            min={0}
                            max={255}
                            title="Merchant description string-table id (0–255), not free text"
                            value={p.merchantDescription ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value.trim()
                              const products = [...tab.products]
                              products[pi] = {
                                ...p,
                                merchantDescription:
                                  raw === ""
                                    ? undefined
                                    : Number.parseInt(raw, 10),
                              }
                              const tabs = [...draft.tabs]
                              tabs[activeTab] = { ...tab, products }
                              setDraft({ ...draft, tabs })
                            }}
                          />
                        </td>
                        <td className="py-1 align-middle">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Remove product"
                            title="Remove product"
                            className="text-[#ff9b9b] hover:bg-[#3a1010] hover:text-[#ffc9c9]"
                            onClick={() => {
                              const products = tab.products.filter(
                                (_, i) => i !== pi
                              )
                              const tabs = [...draft.tabs]
                              tabs[activeTab] = { ...tab, products }
                              setDraft({ ...draft, tabs })
                            }}
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
                title="Add product"
                onClick={() => {
                  const products = [
                    ...tab.products,
                    {
                      productId: 1,
                      basePrice: 0,
                      passthrough: [],
                      preview: null,
                    },
                  ]
                  const tabs = [...draft.tabs]
                  tabs[activeTab] = { ...tab, products }
                  setDraft({ ...draft, tabs })
                }}
              >
                <Plus data-icon="inline-start" />
                Add product
              </Button>

              {saveMutation.isError && (
                <FormAlert variant="error">
                  {saveMutation.error instanceof Error
                    ? saveMutation.error.message
                    : "Save failed"}
                </FormAlert>
              )}
              {saveMutation.isSuccess && !isDirty && (
                <FormAlert variant="success">Saved draft.</FormAlert>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  type="button"
                  disabled={saveMutation.isPending || !isDirty}
                  onClick={() => {
                    saveMutation.reset()
                    const body = toSaveBody(draft)
                    saveMutation.mutate(
                      { shopId: draft.shopId, body },
                      {
                        onSuccess: () => {
                          setBaseline(shopFingerprint(draft))
                        },
                      }
                    )
                  }}
                >
                  {saveMutation.isPending ? "Saving…" : "Save"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={exportPending || !draft}
                  onClick={() => {
                    if (!draft) return
                    void runExport(() => downloadAdminShopXml(draft.shopId))
                  }}
                >
                  {exportPending ? "Downloading…" : "Download XML"}
                </Button>
              </div>
            </div>
          )}
          {draft && !draft.tabs.length && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This shop has no tabs. Add a tab to edit products.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setDraft({
                    ...draft,
                    tabs: [{ name: "New tab", products: [], passthrough: [] }],
                  })
                  setActiveTab(0)
                }}
              >
                <Plus data-icon="inline-start" />
                Add tab
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
