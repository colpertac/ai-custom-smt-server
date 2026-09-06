"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import {
  Check,
  Coins,
  Lock,
  Mail,
  ShoppingBag,
  ShoppingCart,
  Tag,
} from "lucide-react"
import { useState } from "react"

import { useSessionUser } from "@/features/auth/hooks"
import { addToCart } from "@/features/store/cart-storage"
import { fetchStorePrices } from "@/features/store/api"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

async function fetchStoreStatus(): Promise<boolean> {
  const res = await fetch("/api/store/status")
  if (!res.ok) return false
  const body = (await res.json()) as { enabled?: boolean }
  return Boolean(body.enabled)
}

export function WikiStoreBuyPanel({
  itemId,
  itemName,
}: {
  itemId: number
  itemName: string
}) {
  const { data: session } = useSessionUser()
  const [added, setAdded] = useState(false)

  const statusQuery = useQuery({
    queryKey: ["store-status"],
    queryFn: fetchStoreStatus,
    staleTime: 30_000,
  })

  const priceQuery = useQuery({
    queryKey: ["store-price", itemId],
    queryFn: async () => {
      const { prices } = await fetchStorePrices([itemId])
      return prices[0] ?? null
    },
    enabled: statusQuery.data === true,
    staleTime: 60_000,
  })

  if (statusQuery.isLoading || statusQuery.data !== true) {
    return null
  }

  const row = priceQuery.data
  const loading = priceQuery.isLoading
  const sellable = row?.sellable ?? false
  const cp = row?.cp
  const source = row?.source
  const reason =
    row?.reason ??
    (priceQuery.isError ? "Could not load store price" : undefined)

  function handleAdd() {
    if (!session) return
    addToCart({ itemId, name: itemName, qty: 1 })
    setAdded(true)
    window.setTimeout(() => setAdded(false), 1500)
  }

  return (
    <div className="border border-border bg-muted/30 px-2.5 py-2.5">
      <h3 className="flex items-center gap-1.5 font-heading text-[0.65rem] font-semibold tracking-[0.14em] uppercase text-muted-foreground">
        <ShoppingBag className="size-3 text-gold-dim" aria-hidden />
        Web store
      </h3>
      <p className="mt-1.5 flex items-start gap-1.5 text-[0.7rem] leading-snug text-muted-foreground">
        <Mail className="mt-0.5 size-3 shrink-0 opacity-70" aria-hidden />
        <span>Buy with CP — delivered to your account mailbox (claim in-game).</span>
      </p>
      <dl className="mt-2.5 space-y-1.5 text-sm">
        <div className="flex items-start justify-between gap-3">
          <dt className="flex items-center gap-1 text-muted-foreground">
            <Coins className="size-3.5 text-gold-dim" aria-hidden />
            Price
          </dt>
          <dd className="text-right font-medium">
            {loading ? (
              "…"
            ) : sellable && cp != null ? (
              <span className="inline-flex items-center gap-1">
                <span className="tabular-nums">{cp.toLocaleString()} CP</span>
                {source === "override" ? (
                  <span className="inline-flex items-center gap-0.5 text-[0.65rem] uppercase tracking-wider text-gold-dim">
                    <Tag className="size-2.5" aria-hidden />
                    custom
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="text-muted-foreground">Not for sale</span>
            )}
          </dd>
        </div>
      </dl>
      {!sellable && reason ? (
        <p className="mt-1.5 text-[0.7rem] text-muted-foreground">{reason}</p>
      ) : null}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {session ? (
          <>
            <Button
              type="button"
              size="sm"
              disabled={!sellable || loading}
              onClick={handleAdd}
              className={cn(
                "uppercase tracking-wider",
                added && "bg-primary/80"
              )}
            >
              {added ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <ShoppingCart className="size-3.5" aria-hidden />
              )}
              {added ? "Added" : "Add to cart"}
            </Button>
            <Link
              href="/cart"
              className="inline-flex h-7 items-center justify-center gap-1 px-1 text-xs uppercase tracking-wider text-gold-dim no-underline hover:text-gold-hot"
            >
              <ShoppingCart className="size-3" aria-hidden />
              View cart
            </Link>
          </>
        ) : (
          <Link
            href="/login"
            className="inline-flex h-7 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium uppercase tracking-wider hover:bg-muted"
          >
            <Lock className="size-3" aria-hidden />
            Log in to buy
          </Link>
        )}
      </div>
    </div>
  )
}
