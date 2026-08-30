import Link from "next/link"

import type { WikiFusionView } from "@/content/wiki"
import {
  formatArmoryStatLine,
  type ResolvedArmoryGearFeatures,
} from "@/lib/armory-gear-tooltip"

function TooltipSection({
  title,
  tag,
  lines,
  stats,
  sourceId,
  sourceName,
}: {
  title: string
  tag: string
  lines?: string[]
  stats?: { id: string; type: number; label: string; value: number }[]
  sourceId?: number | null
  sourceName?: string | null
}) {
  const hasLines = lines != null && lines.length > 0
  const hasStats = stats != null && stats.length > 0
  if (!hasLines && !hasStats) return null

  return (
    <div className="border-t border-[#3d4454] px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold tracking-[0.12em] text-[#c9a227] uppercase">
          {title}
        </p>
        <span className="font-mono text-[9px] text-[#8b93a8]">{tag}</span>
      </div>
      {sourceId != null && sourceName ? (
        <p className="mt-1 text-[10px] text-[#8b93a8]">
          From:{" "}
          <Link
            href={`/wiki/items/${sourceId}`}
            className="text-[#c9a227] no-underline hover:text-[#f0d060]"
          >
            {sourceName} (#{sourceId})
          </Link>
        </p>
      ) : null}
      {hasStats ? (
        <ul className="mt-1.5 space-y-0.5 text-xs text-[#7dcea0]">
          {stats!.map((stat) => (
            <li key={`${stat.id}-${stat.type}`}>{formatArmoryStatLine(stat)}</li>
          ))}
        </ul>
      ) : null}
      {hasLines ? (
        <ul className="mt-1.5 space-y-0.5 text-xs text-[#7dcea0]">
          {lines!.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function FusionTooltipSection({
  title,
  fusion,
}: {
  title: string
  fusion: WikiFusionView | null
}) {
  if (!fusion) return null
  const hasLines = fusion.lines.length > 0
  const hasEffectName =
    fusion.effectName != null && fusion.effectName.length > 0
  if (!hasLines && !hasEffectName) return null

  return (
    <div className="border-t border-[#3d4454] px-3 py-2">
      <p className="text-[10px] font-semibold tracking-[0.12em] text-[#c9a227] uppercase">
        {title}
      </p>
      <p className="mt-1 text-xs font-medium text-[#e8ecf4]">
        <Link
          href={`/wiki/items/${fusion.sourceItemId}`}
          className="text-[#c9a227] no-underline hover:text-[#f0d060]"
        >
          {fusion.sourceName} (#{fusion.sourceItemId})
        </Link>
      </p>
      {hasEffectName ? (
        <p className="mt-0.5 text-[10px] text-[#8b93a8]">{fusion.effectName}</p>
      ) : null}
      {hasLines ? (
        <ul className="mt-1.5 space-y-0.5 text-xs text-[#7dcea0]">
          {fusion.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function ArmoryGearTooltipContent({
  features,
}: {
  features: ResolvedArmoryGearFeatures
}) {
  const enchants: string[] = []
  if (features.modSlots.length) {
    enchants.push(`Mods ${features.modSlots.join("/")}`)
  }

  const basicSourceId =
    features.basicSourceId !== features.itemType && features.basicSourceName
      ? features.basicSourceId
      : null
  const specialSourceId =
    features.specialSourceId !== features.itemType && features.specialSourceName
      ? features.specialSourceId
      : null

  return (
    <div className="text-left text-xs text-[#e8ecf4]">
      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <p className="font-semibold text-[#c9a0ff] leading-tight">
            {features.name}
          </p>
          <span className="shrink-0 text-[10px] text-[#8b93a8] uppercase">
            {features.slotLabel}
          </span>
        </div>
        {features.itemLevel != null && features.itemLevel > 0 ? (
          <p className="mt-1 text-[#e8ecf4]">Item Level {features.itemLevel}</p>
        ) : null}
        <p className="mt-0.5 font-mono text-[10px] text-[#8b93a8]">
          #{features.itemType}
        </p>
      </div>

      <TooltipSection
        title="Basic features"
        tag="S2"
        stats={features.basicFeatures}
        sourceId={basicSourceId}
        sourceName={features.basicSourceName}
      />
      <TooltipSection
        title="Characteristics"
        tag="S3"
        stats={features.characteristics}
        sourceId={specialSourceId}
        sourceName={features.specialSourceName}
      />
      <TooltipSection title="Set bonus" tag="S1" lines={features.setBonus} />

      <FusionTooltipSection title="Tarot fusion" fusion={features.tarotFusion} />
      <FusionTooltipSection title="Soul fusion" fusion={features.soulFusion} />

      {enchants.length > 0 ? (
        <div className="border-t border-[#3d4454] px-3 py-2 text-[10px] text-[#8b93a8]">
          {enchants.join(" · ")}
        </div>
      ) : null}

      <div className="border-t border-[#3d4454] px-3 py-2">
        <Link
          href={`/wiki/items/${features.itemType}`}
          className="text-[10px] text-[#c9a227] no-underline hover:text-[#f0d060]"
        >
          Open in item wiki →
        </Link>
      </div>
    </div>
  )
}
