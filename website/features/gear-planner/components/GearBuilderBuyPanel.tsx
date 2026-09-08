"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Coins, Mail } from "lucide-react"

import { useSessionDetails, useSessionUser } from "@/features/auth/hooks"
import { Button } from "@/components/ui/button"
import { FormAlert } from "@/components/form-alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { fetcher } from "@/lib/fetcher"
import type { PlannerSlot } from "@/lib/gear-planner-combat"

type QuoteLine = {
  slotLabel: string
  s1ItemId: number
  productId: number
  donorCp: number
  fusePremium: number
  enchantPremium: number
  cp: number
  fused: boolean
  tarot: number
  soul: number
  name: string
}

type QuoteData = {
  totalCp: number
  warnings: string[]
  lines: QuoteLine[]
  customCount: number
  stockCount: number
}

type CheckoutData = {
  replay: boolean
  cpCharged: number
  cpRemaining: number | null
  pieceCount: number
  warnings: string[]
  lines: { slotLabel: string; s1ItemId: number; name: string; cp: number }[]
}

function newClientOrderId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `builder-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

async function fetchStoreEnabled(): Promise<boolean> {
  const res = await fetch("/api/store/status")
  if (!res.ok) return false
  const body = (await res.json()) as { enabled?: boolean }
  return Boolean(body.enabled)
}

export function GearBuilderBuyPanel({ loadout }: { loadout: PlannerSlot[] }) {
  const queryClient = useQueryClient()
  const { data: session, isLoading: sessionLoading } = useSessionUser()
  const detailsQuery = useSessionDetails()
  const [storeEnabled, setStoreEnabled] = useState<boolean | null>(null)
  const [quote, setQuote] = useState<QuoteData | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [checkoutOk, setCheckoutOk] = useState<string | null>(null)

  const equippedCount = useMemo(
    () => loadout.filter((s) => s.s1ItemId != null).length,
    [loadout]
  )
  const cpBalance = detailsQuery.data?.cp

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const enabled = await fetchStoreEnabled()
        if (!cancelled) setStoreEnabled(enabled)
      } catch {
        if (!cancelled) setStoreEnabled(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const refreshQuote = useCallback(async () => {
    if (!session || storeEnabled !== true || equippedCount === 0) {
      setQuote(null)
      setQuoteError(null)
      return
    }
    setQuoteError(null)
    try {
      const data = await fetcher<QuoteData>("builder/checkout", {
        method: "PUT",
        json: { loadout },
      })
      setQuote(data)
    } catch (err) {
      setQuote(null)
      setQuoteError(
        err instanceof Error ? err.message : "Could not price loadout"
      )
    }
  }, [session, storeEnabled, equippedCount, loadout])

  useEffect(() => {
    void refreshQuote()
  }, [refreshQuote])

  const buy = async () => {
    setCheckoutError(null)
    setCheckoutOk(null)
    if (!session || !quote) return
    setBusy(true)
    try {
      const data = await fetcher<CheckoutData>("builder/checkout", {
        method: "POST",
        json: {
          clientOrderId: newClientOrderId(),
          loadout,
        },
      })
      const warn =
        data.warnings?.length > 0
          ? ` Note: ${data.warnings.join(" ")}`
          : ""
      setCheckoutOk(
        data.replay
          ? `Order already completed (${data.cpCharged} CP). Check your in-game mailbox.`
          : `Mailed ${data.pieceCount} piece(s) for ${data.cpCharged} CP.${warn}`
      )
      setConfirmOpen(false)
      void queryClient.invalidateQueries({ queryKey: ["session", "fresh"] })
    } catch (err) {
      setCheckoutError(
        err instanceof Error ? err.message : "Checkout failed"
      )
    } finally {
      setBusy(false)
    }
  }

  if (sessionLoading) return null

  if (!session) {
    // Login prompt is combined with builds panel above.
    return null
  }

  if (storeEnabled === null) {
    return (
      <div className="border border-border bg-card/40 px-3 py-2 text-xs text-muted-foreground">
        Checking store…
      </div>
    )
  }

  if (storeEnabled === false) {
    return (
      <div className="border border-border bg-card/40 px-3 py-2 text-xs text-muted-foreground">
        Web store checkout is currently disabled by an admin.
      </div>
    )
  }

  if (equippedCount === 0) {
    return (
      <div className="border border-border bg-card/40 px-3 py-2 text-xs text-muted-foreground">
        Equip at least one piece to buy the loadout with CP.
      </div>
    )
  }

  const insufficient =
    quote != null && cpBalance != null && cpBalance < quote.totalCp

  return (
    <div className="space-y-2 border border-gold-dim/50 bg-card/40 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-heading text-xs tracking-[0.14em] text-gold-dim uppercase">
          <Coins className="size-3.5" aria-hidden />
          Buy loadout
        </h3>
        <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
          <p className="text-muted-foreground">
            Your CP:{" "}
            <span className="text-foreground tabular-nums">
              {detailsQuery.isLoading
                ? "…"
                : cpBalance != null
                  ? cpBalance.toLocaleString()
                  : "—"}
            </span>
          </p>
          {quote ? (
            <p className="text-foreground tabular-nums">
              {quote.totalCp.toLocaleString()} CP · {equippedCount} piece
              {equippedCount === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      </div>
      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Mail className="mt-0.5 size-3 shrink-0 opacity-70" aria-hidden />
        <span>
          Pays wiki donor prices plus fuse/enchant premiums. Pieces arrive in
          your account mailbox — claim them in-game.
        </span>
      </p>
      {quoteError ? (
        <FormAlert variant="error">{quoteError}</FormAlert>
      ) : null}
      {quote?.warnings?.length ? (
        <p className="text-[11px] text-amber-300/90">
          {quote.warnings.join(" ")}
        </p>
      ) : null}
      {quote && quote.lines.length > 0 ? (
        <ul className="max-h-36 overflow-y-auto border border-border/80 divide-y divide-border/80 text-[11px]">
          {quote.lines.map((line) => (
            <li
              key={`${line.slotLabel}-${line.s1ItemId}-${line.tarot}-${line.soul}`}
              className="flex items-center justify-between gap-2 px-2 py-1"
            >
              <span className="min-w-0 truncate">
                <span className="text-muted-foreground">{line.slotLabel}</span>{" "}
                {line.name}
                {line.fused ? " · fused" : ""}
                {line.tarot || line.soul ? " · enchanted" : ""}
              </span>
              <span className="shrink-0 font-mono">{line.cp} CP</span>
            </li>
          ))}
        </ul>
      ) : null}
      {checkoutError ? (
        <FormAlert variant="error">{checkoutError}</FormAlert>
      ) : null}
      {checkoutOk ? (
        <FormAlert variant="success">{checkoutOk}</FormAlert>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy || !quote || Boolean(quoteError) || insufficient}
          onClick={() => {
            setCheckoutError(null)
            setConfirmOpen(true)
          }}
        >
          Buy with CP
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void refreshQuote()}
        >
          Refresh price
        </Button>
        {insufficient ? (
          <span className="text-[11px] text-destructive">Not enough CP</span>
        ) : null}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading tracking-[0.08em] text-gold-dim uppercase">
              Confirm purchase
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Spend CP to mail this loadout to your account post. Claim the
              pieces in-game.
            </DialogDescription>
          </DialogHeader>

          {quote ? (
            <div className="space-y-2 text-xs">
              <ul className="max-h-48 overflow-y-auto border border-border divide-y divide-border">
                {quote.lines.map((line) => (
                  <li
                    key={`confirm-${line.slotLabel}-${line.s1ItemId}-${line.tarot}-${line.soul}`}
                    className="flex justify-between gap-2 px-2 py-1.5"
                  >
                    <span className="min-w-0 truncate">
                      {line.slotLabel}: {line.name}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums">
                      {line.cp.toLocaleString()} CP
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 font-mono">
                <span className="text-muted-foreground">
                  Balance:{" "}
                  <span className="text-foreground">
                    {cpBalance != null ? cpBalance.toLocaleString() : "—"} CP
                  </span>
                </span>
                <span className="text-foreground">
                  Total: {quote.totalCp.toLocaleString()} CP
                </span>
              </div>
              {quote.warnings.length > 0 ? (
                <p className="text-amber-300/90">{quote.warnings.join(" ")}</p>
              ) : null}
              {checkoutError ? (
                <FormAlert variant="error">{checkoutError}</FormAlert>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || !quote || insufficient}
              onClick={() => void buy()}
            >
              {busy ? "Buying…" : "Confirm buy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
