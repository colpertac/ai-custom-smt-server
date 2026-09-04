"use client"

import Image from "next/image"
import { Fragment } from "react"

import { EQUIP_SLOTS, type EquipSlotKey } from "@/lib/armory-equipment"
import {
  PLANNER_STATS,
  SET_HEADER_COLORS,
  type GearPlannerResult,
  type PlannerAttrs,
  type PlannerSlot,
  type PlannerStatKey,
  plannerSlotDisplay,
} from "@/lib/gear-planner-combat"
import { cn } from "@/lib/utils"

function formatLayerCell(
  stat: PlannerStatKey,
  value: number
): string {
  if (value === 0) return ""
  const def = PLANNER_STATS.find((s) => s.key === stat)!
  if (def.kind === "reduction") return String(value)
  return value > 0 ? `+${value}` : String(value)
}

function formatTotal(
  stat: PlannerStatKey,
  raw: number,
  gearTotal: number
): string {
  const def = PLANNER_STATS.find((s) => s.key === stat)!
  if (def.kind === "reduction") return `${raw - 100}%`
  if (def.kind === "lbCap") return raw.toLocaleString()
  if (def.kind === "percent") return `${gearTotal}%`
  return String(gearTotal)
}

function LayerChip({
  color,
  filled,
  iconSrc,
  title,
}: {
  color: "s1" | "s2" | "s3"
  filled: boolean
  iconSrc?: string | null
  title: string
}) {
  const bg =
    color === "s1"
      ? "border-sky-500 bg-sky-500/80"
      : color === "s2"
        ? "border-emerald-500 bg-emerald-500/80"
        : "border-rose-500 bg-rose-500/80"
  const empty = "border-muted-foreground/40 bg-transparent"
  return (
    <span
      title={title}
      className={cn(
        "inline-flex size-4 items-center justify-center border",
        filled ? bg : empty
      )}
    >
      {filled && iconSrc ? (
        <Image
          src={iconSrc}
          alt=""
          width={12}
          height={12}
          className="pixelated"
          unoptimized
        />
      ) : null}
    </span>
  )
}

export function GearCombatMatrix({
  loadout,
  combat,
  attrs,
  onStatClick,
  onSlotHeaderClick,
}: {
  loadout: PlannerSlot[]
  combat: GearPlannerResult
  attrs: PlannerAttrs
  onStatClick: (stat: PlannerStatKey) => void
  onSlotHeaderClick: (slot: EquipSlotKey) => void
}) {
  return (
    <div className="overflow-x-auto border border-border">
      <table className="w-full min-w-[90rem] border-collapse text-[11px]">
        <thead>
          <tr className="bg-muted/40 text-left">
            <th
              rowSpan={2}
              className="sticky left-0 z-10 border-b border-border bg-muted/95 px-2 py-2 font-heading tracking-wider uppercase"
            >
              Stat
            </th>
            <th
              rowSpan={2}
              className="border-b border-border px-2 py-2 text-right font-semibold text-gold-dim"
            >
              Total
            </th>
            <th
              rowSpan={2}
              className="border-b border-border px-2 py-2 text-right text-[#c9a0ff]"
            >
              Set
            </th>
            {EQUIP_SLOTS.map((slot) => {
              const colorIdx = combat.setColorIndexBySlot[slot.key]
              const bg =
                colorIdx >= 0
                  ? SET_HEADER_COLORS[colorIdx % SET_HEADER_COLORS.length]
                  : undefined
              const presence = combat.layerPresence[slot.key]
              const display = plannerSlotDisplay(
                loadout.find((s) => s.slot === slot.key)!
              )
              return (
                <th
                  key={slot.key}
                  colSpan={3}
                  className="border-b border-l border-border px-1 py-1 text-center"
                  style={bg ? { backgroundColor: `${bg}55` } : undefined}
                >
                  <button
                    type="button"
                    className="w-full hover:text-gold-hot"
                    onClick={() => onSlotHeaderClick(slot.key)}
                  >
                    <span className="mb-1 flex justify-center gap-0.5">
                      <LayerChip
                        color="s1"
                        filled={presence.s1}
                        iconSrc={display.iconSrc}
                        title="S1 present"
                      />
                      <LayerChip
                        color="s2"
                        filled={presence.s2}
                        title="S2 present"
                      />
                      <LayerChip
                        color="s3"
                        filled={presence.s3}
                        title="S3 present"
                      />
                    </span>
                    <span className="font-heading text-[10px] tracking-wider uppercase">
                      {slot.label}
                    </span>
                  </button>
                </th>
              )
            })}
          </tr>
          <tr className="bg-muted/30 text-center text-[9px] text-muted-foreground">
            {EQUIP_SLOTS.map((slot) => (
              <Fragment key={slot.key}>
                <th className="border-l border-border/40 px-0.5 py-0.5 font-normal text-sky-400">
                  S1
                </th>
                <th className="px-0.5 py-0.5 font-normal text-emerald-400">S2</th>
                <th className="px-0.5 py-0.5 font-normal text-rose-400">S3</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {PLANNER_STATS.map((def) => {
            const bd = combat.byStat[def.key]
            return (
              <tr key={def.key} className="border-t border-border/60">
                <th className="sticky left-0 z-10 bg-card/95 px-2 py-1 text-left font-medium">
                  <button
                    type="button"
                    className="text-left hover:text-gold-hot"
                    onClick={() => onStatClick(def.key)}
                  >
                    {def.abbr}
                  </button>
                </th>
                <td
                  className={cn(
                    "px-2 py-1 text-right font-semibold tabular-nums",
                    bd.atCap && "bg-emerald-600/35 text-emerald-100"
                  )}
                >
                  {formatTotal(def.key, bd.raw, bd.gearTotal - bd.attrBonus)}
                </td>
                <td className="px-2 py-1 text-right tabular-nums text-[#c9a0ff]">
                  {formatLayerCell(def.key, bd.setBonus)}
                </td>
                {EQUIP_SLOTS.map((slot) => {
                  const layers = bd.bySlotLayers[slot.key]
                  return (
                    <Fragment key={`${def.key}-${slot.key}`}>
                      <td className="border-l border-border/40 px-0.5 py-1 text-center tabular-nums text-sky-300/90">
                        {formatLayerCell(def.key, layers.s1)}
                      </td>
                      <td className="px-0.5 py-1 text-center tabular-nums text-emerald-300/90">
                        {formatLayerCell(def.key, layers.s2)}
                      </td>
                      <td className="px-0.5 py-1 text-center tabular-nums text-rose-300/90">
                        {formatLayerCell(def.key, layers.s3)}
                      </td>
                    </Fragment>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        Blue / green / red = S1 / S2 / S3. Empty chips = vacant layer. Matching
        header tint = same EquipmentSet. Set column counts multi-piece bonuses
        once.
        {attrs.intel || attrs.speed || attrs.vit
          ? " INT/SPD/VIT fold into Total for Incant/CD."
          : null}
      </p>
    </div>
  )
}
