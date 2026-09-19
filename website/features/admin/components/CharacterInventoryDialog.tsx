"use client"

import { useCallback, useEffect, useState } from "react"

import type { WikiItem } from "@/content/wiki"
import {
  fetchAdminCharacterInventory,
  updateAdminCharacterInventory,
  type AdminInventorySlotView,
} from "@/features/admin/api"
import { WikiItemPicker } from "@/features/admin/components/WikiItemPicker"
import { WikiItemIcon } from "@/features/wiki/components/WikiItemIcon"
import { fetchWikiItem } from "@/lib/wiki-item-client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { FormAlert } from "@/components/form-alert"
import { cn } from "@/lib/utils"

export function CharacterInventoryDialog({
  characterName,
  open,
  onOpenChange,
}: {
  characterName: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [slots, setSlots] = useState<AdminInventorySlotView[]>([])
  const [wikiByType, setWikiByType] = useState<Record<number, WikiItem>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const [qty, setQty] = useState("1")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (name: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAdminCharacterInventory(name)
      setSlots(data.slots)
      const types = [
        ...new Set(
          data.slots
            .filter((s) => !s.empty && s.type != null)
            .map((s) => s.type as number)
        ),
      ]
      const next: Record<number, WikiItem> = {}
      await Promise.all(
        types.map(async (id) => {
          const item = await fetchWikiItem(id)
          if (item) next[id] = item
        })
      )
      setWikiByType((prev) => ({ ...prev, ...next }))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inventory")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open && characterName) {
      void load(characterName)
      setSelectedSlot(null)
    }
  }, [open, characterName, load])

  const selected = slots.find((s) => s.slot === selectedSlot) ?? null
  const selectedWiki =
    selected?.type != null ? wikiByType[selected.type] : undefined

  async function runOps(
    ops: Parameters<typeof updateAdminCharacterInventory>[0]["ops"]
  ) {
    if (!characterName) return
    setBusy(true)
    setError(null)
    try {
      await updateAdminCharacterInventory({ characterName, ops })
      await load(characterName)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-heading tracking-wide uppercase">
            Inventory — {characterName}
          </DialogTitle>
          <DialogDescription>
            Bag slots 1–50. Equipped items cannot be removed here — unequip
            in-game first. Character must be offline.
          </DialogDescription>
        </DialogHeader>

        {error ? <FormAlert variant="error">{error}</FormAlert> : null}
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading bag…</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
            <div className="grid grid-cols-5 gap-1 sm:grid-cols-10">
              {slots.map((slot) => {
                const wiki = slot.type != null ? wikiByType[slot.type] : undefined
                const active = selectedSlot === slot.slot
                return (
                  <button
                    key={slot.slot}
                    type="button"
                    title={
                      slot.empty
                        ? `Slot ${slot.slot} (empty)`
                        : `${wiki?.name ?? `#${slot.type}`} ×${slot.stack_size ?? 1}${
                            slot.equipped ? " (equipped)" : ""
                          }`
                    }
                    className={cn(
                      "relative flex aspect-square flex-col items-center justify-center border border-border bg-muted/30 p-0.5 text-[9px]",
                      active && "border-gold ring-1 ring-gold",
                      slot.equipped && "bg-gold/10",
                      !slot.empty && "hover:bg-muted/60"
                    )}
                    onClick={() => setSelectedSlot(slot.slot)}
                  >
                    {!slot.empty && wiki ? (
                      <WikiItemIcon item={wiki} size={28} />
                    ) : !slot.empty ? (
                      <span className="font-mono text-[10px]">#{slot.type}</span>
                    ) : (
                      <span className="text-muted-foreground">{slot.slot}</span>
                    )}
                    {!slot.empty && (slot.stack_size ?? 1) > 1 ? (
                      <span className="absolute right-0.5 bottom-0.5 font-mono text-[8px] text-gold-dim">
                        {slot.stack_size}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>

            <div className="space-y-3 border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">
                {selectedSlot == null
                  ? "Select a slot"
                  : selected?.empty
                    ? `Slot ${selectedSlot} — empty`
                    : `Slot ${selectedSlot} — ${selectedWiki?.name ?? `#${selected?.type}`}${
                        selected?.equipped ? " (equipped)" : ""
                      }`}
              </p>

              {selected && !selected.empty && !selected.equipped ? (
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">
                      Qty
                    </label>
                    <Input
                      className="h-8 w-20 text-xs"
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      const stackSize = Number(qty)
                      if (!Number.isFinite(stackSize) || stackSize < 1) return
                      void runOps([
                        { op: "set_qty", slot: selected.slot, stackSize },
                      ])
                    }}
                  >
                    Set qty
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() =>
                      void runOps([{ op: "remove", slot: selected.slot }])
                    }
                  >
                    Remove
                  </Button>
                </div>
              ) : null}

              {selectedSlot != null && (!selected || selected.empty) ? (
                <>
                  <p className="text-[11px] text-muted-foreground">
                    Add item to slot {selectedSlot}
                  </p>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-muted-foreground">
                      Qty
                    </label>
                    <Input
                      className="h-8 w-20 text-xs"
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                    />
                  </div>
                  <WikiItemPicker
                    onSelect={(item) => {
                      const stackSize = Number(qty)
                      void runOps([
                        {
                          op: "set",
                          slot: selectedSlot,
                          itemType: item.id,
                          stackSize:
                            Number.isFinite(stackSize) && stackSize > 0
                              ? stackSize
                              : 1,
                        },
                      ])
                    }}
                  />
                </>
              ) : null}

              {selected && !selected.empty && selected.equipped ? (
                <p className="text-[11px] text-[#ff9b9b]">
                  Equipped — unequip in-game before editing this slot.
                </p>
              ) : null}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
