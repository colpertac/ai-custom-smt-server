"use client"

import Link from "next/link"
import { useMemo, useState, useSyncExternalStore } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Coins,
  History,
  Inbox,
  Loader2,
  Mail,
  Minus,
  Package,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Trash2,
  Wallet,
} from "lucide-react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { useSessionDetails } from "@/features/auth/hooks"
import {
  checkoutCart,
  fetchRelatedStoreItems,
  fetchStoreOrders,
  fetchStorePrices,
} from "@/features/store/api"
import {
  CART_CHANGED_EVENT,
  clearCartItems,
  readCart,
  removeFromCart,
  setCartQty,
  addToCart,
  type CartLine,
} from "@/features/store/cart-storage"
import { StoreItemThumb } from "@/features/store/components/StoreItemThumb"
import { cn } from "@/lib/utils"

function newOrderId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `ord-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function subscribeCart(onStoreChange: () => void): () => void {
  window.addEventListener(CART_CHANGED_EVENT, onStoreChange)
  window.addEventListener("storage", onStoreChange)
  return () => {
    window.removeEventListener(CART_CHANGED_EVENT, onStoreChange)
    window.removeEventListener("storage", onStoreChange)
  }
}

function getCartSnapshot(): string {
  return JSON.stringify(readCart())
}

function getServerCartSnapshot(): string {
  return "[]"
}

function useCartLines(): CartLine[] {
  const raw = useSyncExternalStore(
    subscribeCart,
    getCartSnapshot,
    getServerCartSnapshot
  )
  return useMemo(() => JSON.parse(raw) as CartLine[], [raw])
}

function formatOrderDate(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    })
  } catch {
    return String(ms)
  }
}

export function CartPanel() {
  const queryClient = useQueryClient()
  const detailsQuery = useSessionDetails()
  const lines = useCartLines()
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [checkoutOk, setCheckoutOk] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const priceQuery = useQuery({
    queryKey: [
      "store-prices",
      lines.map((l) => `${l.itemId}:${l.qty}`).join(","),
    ],
    queryFn: async () => {
      if (lines.length === 0) return []
      const { prices } = await fetchStorePrices(lines.map((l) => l.itemId))
      return prices
    },
    enabled: lines.length > 0,
    staleTime: 30_000,
  })

  const ordersQuery = useQuery({
    queryKey: ["store-orders"],
    queryFn: fetchStoreOrders,
    staleTime: 15_000,
  })

  const relatedQuery = useQuery({
    queryKey: ["store-related", lines.map((l) => l.itemId).join(",")],
    queryFn: () => fetchRelatedStoreItems(lines.map((l) => l.itemId)),
    enabled: lines.length > 0,
    staleTime: 60_000,
  })

  const prices = useMemo(() => {
    return new Map((priceQuery.data ?? []).map((r) => [r.itemId, r] as const))
  }, [priceQuery.data])

  const totalCp = useMemo(() => {
    let sum = 0
    for (const line of lines) {
      const row = prices.get(line.itemId)
      if (!row?.sellable) continue
      sum += row.cp * line.qty
    }
    return sum
  }, [lines, prices])

  const unsellable = lines.filter((l) => {
    const row = prices.get(l.itemId)
    return row && !row.sellable
  })

  const cpBalance = detailsQuery.data?.cp
  const related = relatedQuery.data?.related ?? []
  const orders = ordersQuery.data?.orders ?? []

  async function handleCheckout() {
    setCheckoutError(null)
    setCheckoutOk(null)
    if (unsellable.length > 0) {
      setCheckoutError("Remove items that are not for sale before checkout")
      return
    }
    if (lines.length === 0) {
      setCheckoutError("Cart is empty")
      return
    }
    setPending(true)
    try {
      const result = await checkoutCart({
        clientOrderId: newOrderId(),
        lines: lines.map((l) => ({ itemId: l.itemId, qty: l.qty })),
      })
      clearCartItems(lines.map((l) => l.itemId))
      void detailsQuery.refetch()
      void queryClient.invalidateQueries({ queryKey: ["store-orders"] })
      setCheckoutOk(
        result.replay
          ? `Order already completed (${result.cpCharged.toLocaleString()} CP). Check your in-game mailbox.`
          : `Charged ${result.cpCharged.toLocaleString()} CP. Items are in your account mailbox — claim them in-game.`
      )
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Checkout failed")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl tracking-wide uppercase">
            <ShoppingCart className="size-6 text-gold-dim" aria-hidden />
            Cart
          </h1>
          <p className="mt-1.5 flex items-start gap-1.5 text-sm text-muted-foreground">
            <Mail className="mt-0.5 size-3.5 shrink-0 opacity-70" aria-hidden />
            <span>
              Checkout spends CP and mails items to your account post. Claim
              them in-game.
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 border border-border bg-muted/30 px-3 py-2 text-sm">
          <Wallet className="size-4 text-gold-dim" aria-hidden />
          <div>
            <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              Your CP
            </p>
            <p className="font-medium tabular-nums">
              {detailsQuery.isLoading
                ? "…"
                : cpBalance != null
                  ? cpBalance.toLocaleString()
                  : "—"}
            </p>
          </div>
        </div>
      </header>

      {priceQuery.isError ? (
        <FormAlert variant="error">
          {priceQuery.error instanceof Error
            ? priceQuery.error.message
            : "Failed to load prices"}
        </FormAlert>
      ) : null}
      {checkoutError ? (
        <FormAlert variant="error">{checkoutError}</FormAlert>
      ) : null}
      {checkoutOk ? (
        <FormAlert variant="success">
          <span className="inline-flex items-start gap-2">
            <Inbox className="mt-0.5 size-4 shrink-0" aria-hidden />
            {checkoutOk}
          </span>
        </FormAlert>
      ) : null}

      <section className="space-y-3" aria-labelledby="cart-items-heading">
        <h2
          id="cart-items-heading"
          className="flex items-center gap-2 font-heading text-xs font-semibold tracking-[0.14em] uppercase text-gold-dim"
        >
          <Package className="size-3.5" aria-hidden />
          Items in cart
        </h2>

        {lines.length === 0 ? (
          <div className="flex flex-col items-start gap-3 border border-dashed border-border bg-muted/20 px-4 py-8">
            <ShoppingBag className="size-8 text-muted-foreground/50" aria-hidden />
            <p className="text-sm text-muted-foreground">
              Your cart is empty.{" "}
              <Link
                href="/wiki"
                className="text-gold-dim underline hover:text-gold"
              >
                Browse the wiki
              </Link>{" "}
              to add gear and items.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {lines.map((line) => {
              const row = prices.get(line.itemId)
              const unit = row?.sellable ? row.cp : null
              return (
                <li
                  key={line.itemId}
                  className="flex flex-wrap items-center gap-3 bg-card/30 px-3 py-3 sm:flex-nowrap"
                >
                  <StoreItemThumb
                    name={line.name}
                    iconSrc={row?.iconSrc}
                    size={40}
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/wiki/items/${line.itemId}`}
                      className="font-medium text-gold-dim no-underline hover:text-gold-hot"
                    >
                      {line.name}
                    </Link>
                    <p className="mt-0.5 font-mono text-[0.65rem] text-muted-foreground">
                      #{line.itemId}
                      {row?.source === "override" ? " · custom price" : null}
                      {row && !row.sellable ? (
                        <span className="text-destructive">
                          {" "}
                          · {row.reason || "not sellable"}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {unit != null ? (
                        <span className="inline-flex items-center gap-1">
                          <Coins className="size-3 text-gold-dim" aria-hidden />
                          <span className="tabular-nums">
                            {unit.toLocaleString()} CP each
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="size-8 p-0"
                      aria-label="Decrease quantity"
                      disabled={line.qty <= 1}
                      onClick={() => setCartQty(line.itemId, line.qty - 1)}
                    >
                      <Minus className="size-3.5" />
                    </Button>
                    <span className="w-8 text-center font-mono text-sm tabular-nums">
                      {line.qty}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="size-8 p-0"
                      aria-label="Increase quantity"
                      disabled={line.qty >= 10}
                      onClick={() => setCartQty(line.itemId, line.qty + 1)}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                  <div className="w-20 text-right text-sm font-medium tabular-nums">
                    {unit != null
                      ? `${(unit * line.qty).toLocaleString()} CP`
                      : "—"}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${line.name}`}
                    onClick={() => removeFromCart(line.itemId)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}

        {lines.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-muted/25 px-4 py-3">
            <div>
              <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                Order total
              </p>
              <p className="flex items-center gap-1.5 text-lg font-medium tabular-nums">
                <Coins className="size-4 text-gold-dim" aria-hidden />
                {totalCp.toLocaleString()} CP
              </p>
            </div>
            <Button
              type="button"
              disabled={pending || unsellable.length > 0}
              onClick={() => void handleCheckout()}
              className="uppercase tracking-wider"
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Mail className="size-3.5" aria-hidden />
              )}
              {pending ? "Checking out…" : "Checkout to mailbox"}
            </Button>
          </div>
        ) : null}
      </section>

      {lines.length > 0 ? (
        <section className="space-y-3" aria-labelledby="related-heading">
          <h2
            id="related-heading"
            className="flex items-center gap-2 font-heading text-xs font-semibold tracking-[0.14em] uppercase text-gold-dim"
          >
            <Sparkles className="size-3.5" aria-hidden />
            Related items
          </h2>
          {relatedQuery.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Finding related gear…
            </p>
          ) : related.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No related sellable items right now.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {related.map((item) => (
                <li
                  key={item.itemId}
                  className="flex items-center gap-3 border border-border bg-card/30 px-3 py-2"
                >
                  <StoreItemThumb
                    name={item.name}
                    iconSrc={item.iconSrc}
                    size={36}
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/wiki/items/${item.itemId}`}
                      className="block truncate text-sm font-medium text-gold-dim no-underline hover:text-gold-hot"
                    >
                      {item.name}
                    </Link>
                    <p className="text-[0.65rem] capitalize text-muted-foreground">
                      {item.equipSlot || item.category} ·{" "}
                      <span className="tabular-nums">
                        {item.cp.toLocaleString()} CP
                      </span>
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 uppercase tracking-wider"
                    disabled={!item.sellable}
                    onClick={() =>
                      addToCart({
                        itemId: item.itemId,
                        name: item.name,
                        qty: 1,
                      })
                    }
                  >
                    <Plus className="size-3.5" aria-hidden />
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="space-y-3" aria-labelledby="history-heading">
        <h2
          id="history-heading"
          className="flex items-center gap-2 font-heading text-xs font-semibold tracking-[0.14em] uppercase text-gold-dim"
        >
          <History className="size-3.5" aria-hidden />
          Previous purchases
        </h2>
        {ordersQuery.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Loading history…
          </p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No web-store purchases yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {orders.map((order) => (
              <li
                key={order.clientOrderId}
                className="border border-border bg-card/20 px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{formatOrderDate(order.createdAt)}</span>
                  <span className="inline-flex items-center gap-1 font-medium text-foreground tabular-nums">
                    <Coins className="size-3 text-gold-dim" aria-hidden />
                    {order.cpCharged.toLocaleString()} CP
                  </span>
                </div>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {order.lines.map((line) => (
                    <li key={`${order.clientOrderId}-${line.itemId}`}>
                      <Link
                        href={`/wiki/items/${line.itemId}`}
                        className={cn(
                          "inline-flex items-center gap-1.5 border border-border bg-muted/30 px-1.5 py-1 text-xs no-underline transition-colors hover:border-gold-dim/50 hover:bg-muted/50"
                        )}
                        title={line.name}
                      >
                        <StoreItemThumb
                          name={line.name}
                          iconSrc={line.iconSrc}
                          size={22}
                        />
                        <span className="max-w-[10rem] truncate text-foreground">
                          {line.name}
                        </span>
                        {line.qty > 1 ? (
                          <span className="font-mono text-muted-foreground">
                            ×{line.qty}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
