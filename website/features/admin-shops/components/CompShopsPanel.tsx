"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Plus, Trash2 } from "lucide-react"

import {
  adminShopExportUrl,
  adminShopsExportAllUrl,
  type ShopDetail,
  type ShopProductRow,
} from "@/features/admin-shops/api"
import {
  useAdminShop,
  useAdminShops,
  useCreateAdminShop,
  useDeleteAdminShop,
  useSaveAdminShop,
} from "@/features/admin-shops/hooks"
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

function currencyLabel(p: ShopProductRow): string {
  if (!p.preview) return "?"
  return p.preview.isCp ? "CP" : "Macca"
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
  const { data: list, isLoading, isError, error } = useAdminShops()
  const [filter, setFilter] = useState("")
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

  const isDirty = useMemo(() => {
    if (!draft || baseline == null) return false
    return shopFingerprint(draft) !== baseline
  }, [draft, baseline])

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

  const confirmDiscard = useCallback(() => {
    if (!dirtyRef.current) return true
    return window.confirm(UNSAVED_MSG)
  }, [])

  const selectShop = useCallback(
    (shopId: number) => {
      if (shopId === selectedId) return
      if (!confirmDiscard()) return
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
                      if (selectedId === s.shopId && !confirmDiscard()) return
                      if (
                        !window.confirm(
                          `Delete working-copy shop ${s.shopId} (${s.name})?`
                        )
                      ) {
                        return
                      }
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
                if (!confirmDiscard()) return
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
              }}
            >
              <Plus data-icon="inline-start" />
              {createMutation.isPending ? "Creating…" : "Create shop"}
            </Button>
          </div>

          <a
            href={adminShopsExportAllUrl()}
            download
            className="inline-flex h-7 items-center justify-center border border-border bg-muted/40 px-2.5 text-xs font-semibold hover:border-gold-dim hover:text-gold-hot"
          >
            Download all (zip)
          </a>
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
            {draft?.filename ??
              "ProductID is a ShopProductData id; currency comes from the item."}
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
                      <th className="py-1 pr-2 font-medium">MerchantDesc</th>
                      <th className="py-1 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {tab.products.map((p, pi) => (
                      <tr
                        key={`${p.productId}-${pi}`}
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
                        <td className="py-1 pr-2 align-middle text-xs">
                          {currencyLabel(p)}
                        </td>
                        <td className="py-1 pr-2 align-middle">
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
                        </td>
                        <td className="py-1 pr-2 align-middle">
                          <Input
                            className="h-8 w-20"
                            value={p.merchantDescription ?? ""}
                            onChange={(e) => {
                              const products = [...tab.products]
                              products[pi] = {
                                ...p,
                                merchantDescription: e.target.value,
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
                <FormAlert variant="success">Saved to working copy.</FormAlert>
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
                <a
                  href={adminShopExportUrl(draft.shopId)}
                  download
                  className="inline-flex h-8 items-center justify-center border border-border bg-muted/40 px-3 text-xs font-semibold hover:border-gold-dim hover:text-gold-hot"
                >
                  Download XML
                </a>
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
