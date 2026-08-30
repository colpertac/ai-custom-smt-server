import type {
  BossCrateDrop,
  ChoiceMessagesStore,
  CustomEventMessage,
  ReportRewardDungeon,
  ReportRewardGlobal,
  ReportTradeTier,
  ReportTraderNpc,
} from "./report-reward-types.ts"
import {
  STOCK_REPORT_TRADE_CANCEL_MESSAGE_ID,
  resolveTradeTiersWithMessages,
  tradeTiersMissingStockLabels,
} from "./report-reward-types.ts"
import { REPORT_TRADER_PARTIAL_ID } from "./report-reward-append-catalog.ts"
import {
  dropsFingerprint,
  dungeonBossDrops,
} from "./report-reward-normalize.ts"

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function tierEventId(prefix: string, index: number): string {
  return `${prefix}_T${String(index + 1).padStart(2, "0")}`
}

function dropElement(d: BossCrateDrop, indent: string): string {
  return `${indent}<element>
${indent}    <object>
${indent}        <member name="ItemType">${d.itemId}</member>
${indent}        <member name="MinStack">${d.minStack}</member>
${indent}        <member name="MaxStack">${d.maxStack}</member>
${indent}        <member name="Rate">${d.rate}</member>
${indent}    </object>
${indent}</element>`
}

/** Prefer core B/S/G over bearcat / per-floor siblings on the same stock crate. */
export function isCanonicalLootDungeonId(id: string): boolean {
  return /-(bronze|silver|gold)$/.test(id) && !id.includes("bearcat")
}

export function pickCanonicalLootDungeon(
  group: ReportRewardDungeon[]
): ReportRewardDungeon {
  const core = group.find((d) => isCanonicalLootDungeonId(d.id))
  if (core) return core
  return [...group].sort((a, b) => a.id.localeCompare(b.id))[0]!
}

export function groupEnabledByAppendDropSet(
  dungeons: ReportRewardDungeon[]
): Map<number, ReportRewardDungeon[]> {
  const byAppend = new Map<number, ReportRewardDungeon[]>()
  for (const d of dungeons.filter((x) => x.enabled)) {
    const list = byAppend.get(d.appendDropSetId) ?? []
    list.push(d)
    byAppend.set(d.appendDropSetId, list)
  }
  return byAppend
}

/**
 * One stock crate DropSet can only APPEND one drop table.
 * When several dungeon rows share an APPEND id, pick a canonical table
 * and note siblings that differed (they still publish as that table).
 */
export function resolveAppendDropSets(
  dungeons: ReportRewardDungeon[],
  global: ReportRewardGlobal
): {
  byAppend: Map<number, ReportRewardDungeon>
  warnings: string[]
} {
  const warnings: string[] = []
  const byAppend = new Map<number, ReportRewardDungeon>()

  for (const [appendId, group] of groupEnabledByAppendDropSet(dungeons)) {
    const canonical = pickCanonicalLootDungeon(group)
    const canonSig = dropsFingerprint(
      dungeonBossDrops(canonical, global.reportItemId)
    )
    const divergent = group
      .filter((d) => d.id !== canonical.id)
      .filter(
        (d) =>
          dropsFingerprint(dungeonBossDrops(d, global.reportItemId)) !==
          canonSig
      )
    if (divergent.length) {
      warnings.push(
        `Boss crate ${appendId}: using drops from ${canonical.id}; synced over ${divergent.map((d) => d.id).join(", ")} (same stock crate)`
      )
    }
    byAppend.set(appendId, {
      ...canonical,
      drops: dungeonBossDrops(canonical, global.reportItemId),
    })
  }

  return { byAppend, warnings }
}

/** @deprecated Prefer resolveAppendDropSets — conflicts are reconciled, not errors. */
export function validateAppendDropSets(
  dungeons: ReportRewardDungeon[],
  global: ReportRewardGlobal
): string[] {
  return resolveAppendDropSets(dungeons, global).warnings
}

export function generateAppendDropSetsXml(
  dungeons: ReportRewardDungeon[],
  global: ReportRewardGlobal
): string {
  const { byAppend } = resolveAppendDropSets(dungeons, global)

  const blocks = [...byAppend.entries()]
    .sort(([a], [b]) => a - b)
    .map(([appendId, d]) => {
      const drops = dungeonBossDrops(d, global.reportItemId)
        .map((drop) => dropElement(drop, "            "))
        .join("\n")
      return `    <object name="DropSet">
        <member name="ID">${appendId}</member>
        <desc>${esc(d.name)} boss crate loot</desc>
        <member name="Type">APPEND</member>
        <member name="Drops">
${drops}
        </member>
    </object>`
    })

  return `<objects>
    <!-- Generated boss-crate APPEND drops — merged into stock boss crates -->
${blocks.join("\n")}
</objects>
`
}

function choiceXml(
  prefix: string,
  tier: ReportTradeTier,
  index: number,
  itemId: number
): string {
  const next = tierEventId(prefix, index)
  const msg = tier.choiceMessageId
  if (msg == null) {
    throw new Error(
      `Report trade package cost ${tier.cost} has no stock dialog messageID`
    )
  }
  return `            <element>
                <object name="EventChoice">
                    <member name="next">${esc(next)}</member>
                    <member name="messageID">${msg}</member>
                    <member name="conditions">
                        <element>
                            <object name="EventCondition">
                                <member name="type">ITEM</member>
                                <member name="value1">${itemId}</member>
                                <member name="value2">${tier.cost}</member>
                            </object>
                        </element>
                    </member>
                </object>
            </element>`
}

/** Jackfrost cancel — message only, no next / conditions. */
function cancelChoiceXml(): string {
  return `            <element>
                <object name="EventChoice">
                    <member name="messageID">${STOCK_REPORT_TRADE_CANCEL_MESSAGE_ID}</member>
                </object>
            </element>`
}

function tradeTierXml(
  prefix: string,
  tier: ReportTradeTier,
  index: number,
  itemId: number
): string {
  const id = tierEventId(prefix, index)
  const end = `${prefix}_END`
  return `    <object name="EventPerformActions">
        <member name="ID">${esc(id)}</member>
        <member name="next">${esc(end)}</member>
        <member name="actions">
            <element>
                <object name="ActionAddRemoveItems">
                    <member name="items">
                        <pair>
                            <key>${itemId}</key>
                            <value>-${tier.cost}</value>
                        </pair>
                    </member>
                </object>
            </element>
            <element>
                <object name="ActionUpdatePoints">
                    <member name="pointType">CP</member>
                    <member name="value">${tier.cp}</member>
                </object>
            </element>
        </member>
    </object>`
}

export function generateReportTradeEventsXml(
  global: ReportRewardGlobal,
  tradeTiers: ReportTradeTier[]
): string {
  const p = global.eventPrefix
  const end = `${p}_END`
  const greet = `${p}_GREET`
  const prompt = `${p}_PROMPT`
  const itemId = global.reportItemId

  const choices = [
    ...tradeTiers.map((tier, i) => choiceXml(p, tier, i, itemId)),
    cancelChoiceXml(),
  ].join("\n")

  const tiers = tradeTiers
    .map((tier, i) => tradeTierXml(p, tier, i, itemId))
    .join("\n")

  return `<objects>
    <!-- Report trade NPC — item ${itemId} → CP (${global.itemsPerCp} items / 1 CP, linear) -->
    <object name="EventNPCMessage">
        <member name="ID">${esc(end)}</member>
        <member name="messageIDs">
            <element>${global.endMessageId}</element>
        </member>
    </object>
    <object name="EventNPCMessage">
        <member name="ID">${esc(greet)}</member>
        <member name="next">${esc(prompt)}</member>
        <member name="messageIDs">
            <element>${global.greetMessageId}</element>
        </member>
    </object>
    <object name="EventPrompt">
        <member name="ID">${esc(prompt)}</member>
        <member name="messageID">${global.promptMessageId}</member>
        <member name="choices">
${choices}
        </member>
    </object>
${tiers}
</objects>
`
}

function traderNpcXml(trader: ReportTraderNpc, eventId: string): string {
  return `            <element>
                <object name="ServerNPC">
                    <member name="ID">${trader.npcId}</member>
                    <member name="X">${trader.x}</member>
                    <member name="Y">${trader.y}</member>
                    <member name="Rotation">${trader.rotation}</member>
                    <member name="Actions">
                        <element>
                            <object name="ActionStartEvent">
                                <member name="eventID">${esc(eventId)}</member>
                            </object>
                        </element>
                    </member>
                </object>
            </element>`
}

export function generateReportTradersPartialXml(
  global: ReportRewardGlobal
): string {
  const greet = `${global.eventPrefix}_GREET`
  const mapIds = [
    ...new Set(global.traders.map((t) => t.dynamicMapId)),
  ].sort((a, b) => a - b)
  const npcs = global.traders
    .map((t) => traderNpcXml(t, greet))
    .join("\n")

  const mapElements = mapIds
    .map((id) => `            <element>${id}</element>`)
    .join("\n")

  return `<objects>
    <object name="ServerZonePartial">
        <member name="ID">${REPORT_TRADER_PARTIAL_ID}</member>
        <member name="AutoApply">true</member>
        <member name="DynamicMapIDs">
${mapElements}
        </member>
        <member name="NPCs">
${npcs}
        </member>
    </object>
</objects>
`
}

export const REPORT_REWARDS_PACKAGE_PATHS = {
  appendDropSet: "data/dropset/ai_custom_report_rewards_append.xml",
  tradeEvents: "events/ai_custom_report_trade.xml",
  tradersPartial: "zones/partial/ai_custom_report_traders.xml",
} as const

export function buildReportRewardsPackageFiles(
  dungeons: ReportRewardDungeon[],
  global: ReportRewardGlobal,
  choiceStore: ChoiceMessagesStore = { byCost: {} }
): {
  files: Record<string, string>
  warnings: string[]
  choiceStore: ChoiceMessagesStore
  customEventMessages: CustomEventMessage[]
  choiceMessagesAllocated: boolean
} {
  const enabled = dungeons.filter((d) => d.enabled)
  const warnings: string[] = []
  const empty = {
    files: {} as Record<string, string>,
    warnings,
    choiceStore,
    customEventMessages: [] as CustomEventMessage[],
    choiceMessagesAllocated: false,
  }
  if (!enabled.length && !global.traders.length) {
    return empty
  }
  const files: Record<string, string> = {}
  if (enabled.length) {
    const resolved = resolveAppendDropSets(dungeons, global)
    warnings.push(...resolved.warnings)
    files[REPORT_REWARDS_PACKAGE_PATHS.appendDropSet] =
      generateAppendDropSetsXml(dungeons, global)
  }

  let nextStore = choiceStore
  let customEventMessages: CustomEventMessage[] = []
  let choiceMessagesAllocated = false

  if (global.itemsPerCp >= 1 && global.traders.length) {
    const resolved = resolveTradeTiersWithMessages(
      global.itemsPerCp,
      global.cpPackages,
      choiceStore
    )
    nextStore = resolved.store
    customEventMessages = resolved.customMessages
    choiceMessagesAllocated = resolved.allocated
    const missingStock = tradeTiersMissingStockLabels(
      global.itemsPerCp,
      global.cpPackages
    )
    if (missingStock.length) {
      warnings.push(
        `CP trade: ${missingStock.length} package(s) use custom client dialog labels (item costs ${missingStock
          .map((t) => t.cost)
          .join(", ")}); publish will patch CEventMessage + rehash — players must run ImagineUpdate`
      )
    }
    files[REPORT_REWARDS_PACKAGE_PATHS.tradeEvents] =
      generateReportTradeEventsXml(global, resolved.tiers)
    files[REPORT_REWARDS_PACKAGE_PATHS.tradersPartial] =
      generateReportTradersPartialXml(global)
  }
  return {
    files,
    warnings,
    choiceStore: nextStore,
    customEventMessages,
    choiceMessagesAllocated,
  }
}
