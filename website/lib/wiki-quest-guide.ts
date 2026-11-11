import { getExpertiseName } from "@/lib/armory-catalogs"
import {
  getQuestById,
  getQuestGuide,
  loadQuestGuidesPayload,
  loadQuestsPayload,
  type QuestGuide,
  type QuestGuideAction,
  type QuestGuideCondition,
  type QuestGuideStep,
  type QuestGuideTalk,
  type QuestGuideTrigger,
  type QuestRecord,
} from "@/lib/quest-catalog-load"
import {
  loadDevilsPayload,
  loadSkillsPayload,
  loadValuablesPayload,
  loadWikiItemsPayload,
} from "@/lib/wiki-catalog-load"
import {
  formatQuestRequirement,
  parseQuestJournalLine,
} from "@/lib/wiki-quest-format"
import { getZoneName } from "@/lib/zone-names"

/** One linkable mention: an item, demon, quest, zone… with optional count. */
export type QuestRef = {
  label: string
  href?: string
  count?: number
  note?: string
}

export type QuestDialogueLine = {
  speaker: string | null
  kind: "npc" | "you" | "system" | "scene"
  text: string
}

/** One conversation in a multi-step route (consecutive ones merged). */
export type QuestTalk = {
  verb: string
  targets: QuestRef[]
  where: string | null
  grid: { x: number; y: number } | null
  choices: string[]
  gains: QuestRef[]
  losses: QuestRef[]
  random: boolean
}

export type QuestRoute = {
  /** "Talk to" / "Defeat" / "Interact with" … */
  verb: string
  targets: QuestRef[]
  where: string | null
  /** Map grid label for where to go, e.g. { x: 24, y: 36 }. */
  grid: { x: number; y: number } | null
  choices: string[]
  needs: QuestRef[]
  fights: { where: string | null; enemies: QuestRef[] }[]
  gains: QuestRef[]
  losses: QuestRef[]
  effects: QuestRef[]
  dialogue: QuestDialogueLine[]
  eventId: string
  file?: string
  /** Conversations to have in order; set for flag-puzzle steps. */
  sequence: QuestTalk[]
  /** Which random outcome this route is for, e.g. "If DB Saito gives you Blue Card". */
  when: string | null
}

export type QuestWalkStep = {
  key: string
  kind: "start" | "objective" | "complete"
  title: string
  journal: string | null
  requirements: QuestRef[]
  /** Alternative ways the game accepts for this step (usually one). */
  routes: QuestRoute[]
  /** Routes that differ only in one answer order, folded into a table. */
  table: QuestVariantTable | null
}

/**
 * Several routes with the same stops where only one stop's answer order
 * changes (Act 12: the first card decides the insertion order).
 */
export type QuestVariantTable = {
  /** Stops shared by every variant; `orderAt` is the stop whose answers vary. */
  talks: QuestTalk[]
  orderAt: number
  /** Words every answer shares, e.g. "Insert" … "Card" (may be empty). */
  prefix: string
  suffix: string
  rows: { when: QuestRef[]; order: string[] }[]
  /** First variant, for rewards / needs / dialogue. */
  route: QuestRoute
}

export type QuestWalkthrough = {
  hasGuide: boolean
  giver: string | null
  location: string | null
  coords: { x: number; y: number } | null
  levelMin: number | null
  alignment: string | null
  repeatable: boolean
  prerequisites: QuestRef[]
  /** Unlocked quests and QuestData "next quests", deduplicated. */
  unlocks: QuestRef[]
  rewards: QuestRef[]
  steps: QuestWalkStep[]
}

const POINT_LABELS: Record<string, string> = {
  CP: "CP",
  SOUL_POINTS: "Soul Points",
  DIGITALIZE_POINTS: "Digitalize Points",
  COINS: "Casino Coins",
  ITIME: "I-Time Points",
  BP: "Battle Points",
  COWRIE: "Cowrie",
  BETHEL: "Bethel",
  ZIOTITE: "Ziotite",
  REUNION_POINTS: "Reunion Points",
  FAMILIARITY: "Familiarity",
}

const LNC_TYPE_LABELS: Record<number, string> = {
  0: "Law",
  2: "Neutral",
  4: "Chaos",
}

type Lookups = {
  item: (id: number) => string
  devil: (id: number) => string
  skill: (id: number) => string
  valuable: (id: number) => string
  quest: (id: number) => string
  zone: (id: number | null | undefined) => string | null
  npc: (id: number | undefined) => string | null
  npcName: (id: number | undefined) => string | null
}

function memo<T>(build: () => Map<number, T>): () => Map<number, T> {
  let cache: Map<number, T> | null = null
  return () => (cache ??= build())
}

const itemNames = memo(
  () => new Map(loadWikiItemsPayload().data.items.map((i) => [i.id, i.name]))
)
const skillNames = memo(
  () => new Map(loadSkillsPayload().data.skills.map((s) => [s.id, s.name]))
)
const valuableNames = memo(
  () =>
    new Map(loadValuablesPayload().data.valuables.map((v) => [v.id, v.name]))
)

function lookups(): Lookups {
  const guides = loadQuestGuidesPayload()
  const devils = loadDevilsPayload().data.names
  return {
    item: (id) => itemNames().get(id) ?? `Item ${id}`,
    devil: (id) => devils[String(id)] ?? `Demon ${id}`,
    skill: (id) => skillNames().get(id) ?? `Skill ${id}`,
    valuable: (id) => valuableNames().get(id) ?? `Valuable ${id}`,
    quest: (id) => getQuestById(id)?.title ?? `Quest ${id}`,
    zone: (id) =>
      id
        ? (guides.zoneNames[String(id)] ?? getZoneName(id) ?? `Zone ${id}`)
        : null,
    npc: (id) => (id ? (guides.npcNames[String(id)] ?? `NPC #${id}`) : null),
    npcName: (id) => (id ? (guides.npcNames[String(id)] ?? null) : null),
  }
}

function questRef(L: Lookups, id: number): QuestRef {
  return { label: L.quest(id), href: `/wiki/quests/${id}` }
}

function formatGuideCondition(L: Lookups, c: QuestGuideCondition): QuestRef {
  const v1 = c.value1 ?? 0
  const v2 = c.value2 ?? 0
  const ref = ((): QuestRef => {
    switch (c.type) {
      case "LEVEL":
        if (c.compareMode === "BETWEEN") return { label: `Level ${v1}–${v2}` }
        if (c.compareMode === "LT") return { label: `Level below ${v1}` }
        return { label: `Level ${v1}+` }
      case "ITEM":
        return {
          label: `Carry ${L.item(v1)}`,
          href: `/wiki/items/${v1}`,
          count: v2 > 1 ? v2 : undefined,
        }
      case "EQUIPPED":
        return { label: `Equip ${L.item(v1)}`, href: `/wiki/items/${v1}` }
      case "VALUABLE":
        return {
          label: `${v2 === 0 ? "Not holding" : "Holding"} ${L.valuable(v1)}`,
          href: `/wiki/valuables/${v1}`,
        }
      case "QUEST_COMPLETE":
        return { ...questRef(L, v1), label: `Completed “${L.quest(v1)}”` }
      case "QUEST_ACTIVE":
        return {
          ...questRef(L, v1),
          label: `${v2 === 0 ? "Not on" : "On"} “${L.quest(v1)}”`,
        }
      case "QUEST_PHASE":
        return {
          ...questRef(L, v1),
          label: `“${L.quest(v1)}” at step ${v2 + 1}`,
        }
      case "LNC_TYPE":
        return {
          label: `${LNC_TYPE_LABELS[v1] ?? `Alignment ${v1}`} alignment`,
        }
      case "LNC":
        return { label: `Alignment points ${v1}${v2 ? `–${v2}` : "+"}` }
      case "GENDER":
        return { label: v1 === 0 ? "Male character" : "Female character" }
      case "EXPERTISE": {
        const rank = v2 >= 10_000 ? `${(v2 / 100_000).toFixed(1)}` : String(v2)
        return { label: `${getExpertiseName(v1)} expertise class ${rank}+` }
      }
      case "SUMMONED":
        return { label: `${L.devil(v1)} summoned`, href: `/wiki/demons/${v1}` }
      case "PARTY_SIZE":
        return { label: `Party of ${v1}+` }
      case "INVENTORY_FREE":
        return { label: `${v1} free inventory slot${v1 === 1 ? "" : "s"}` }
      case "COMP_FREE":
        return { label: `${v1} free COMP slot${v1 === 1 ? "" : "s"}` }
      case "MOON_PHASE":
        return {
          label: `Moon phase ${v1}${c.compareMode === "BETWEEN" ? `–${v2}` : ""}`,
        }
      case "TIMESPAN":
        return { label: `Game time ${clock(v1)}–${clock(v2)}` }
      case "PLUGIN":
        return { label: `Plugin #${v1} unlocked` }
      default:
        return {
          label: `${c.type.toLowerCase().replaceAll("_", " ")} (${v1}, ${v2})`,
        }
    }
  })()
  return c.negate ? { ...ref, label: `Not: ${ref.label}` } : ref
}

function clock(hhmm: number): string {
  const s = String(hhmm).padStart(4, "0")
  return `${s.slice(0, 2)}:${s.slice(2)}`
}

function sortAction(
  L: Lookups,
  questId: number,
  act: QuestGuideAction,
  out: Pick<QuestRoute, "gains" | "losses" | "effects">
): void {
  switch (act.type) {
    case "items":
      for (const { id, count } of act.items) {
        const ref: QuestRef = {
          label: L.item(id),
          href: `/wiki/items/${id}`,
          count: Math.abs(count),
          note: act.mode === "POST" ? "via mailbox" : undefined,
        }
        ;(count < 0 ? out.losses : out.gains).push(ref)
      }
      return
    case "xp": {
      const who =
        act.target === "PARTNER"
          ? " (partner demon)"
          : act.target === "CHARACTER_AND_PARTNER"
            ? " (you + partner)"
            : ""
      out.gains.push({ label: `${act.amount.toLocaleString()} XP${who}` })
      return
    }
    case "lnc":
      if (act.set) {
        out.effects.push({ label: `Alignment set to ${act.value}` })
      } else if (act.value !== 0) {
        out.effects.push({
          label: `Alignment ${act.value > 0 ? "+" : "−"}${Math.abs(act.value)} (${act.value > 0 ? "Chaos" : "Law"})`,
        })
      }
      return
    case "skills":
      for (const id of act.skills) {
        out.gains.push({
          label: `Skill: ${L.skill(id)}`,
          href: `/wiki/skills/${id}`,
          note: act.target === "PARTNER" ? "partner" : undefined,
        })
      }
      for (const e of act.expertise ?? []) {
        out.gains.push({
          label: `${getExpertiseName(e.id)} expertise +${(e.points / 100).toLocaleString()}`,
        })
      }
      return
    case "points": {
      const label = POINT_LABELS[act.pointType] ?? act.pointType
      if (act.set) out.effects.push({ label: `${label} set to ${act.value}` })
      else
        (act.value < 0 ? out.losses : out.gains).push({
          label: `${Math.abs(act.value).toLocaleString()} ${label}`,
        })
      return
    }
    case "flag": {
      const ref: QuestRef =
        act.flagType === "VALUABLE"
          ? {
              label: `Valuable: ${L.valuable(act.id)}`,
              href: `/wiki/valuables/${act.id}`,
            }
          : act.flagType === "PLUGIN"
            ? { label: `Plugin #${act.id}` }
            : act.flagType === "TITLE"
              ? { label: `Title #${act.id}` }
              : { label: `${act.flagType.toLowerCase()} #${act.id}` }
      ;(act.remove ? out.losses : out.gains).push(ref)
      return
    }
    case "demons":
      if (act.chosen) out.losses.push({ label: "A demon of your choice" })
      for (const d of act.add)
        out.gains.push({
          label: L.devil(d.id),
          href: `/wiki/demons/${d.id}`,
          count: d.count,
        })
      for (const d of act.remove)
        out.losses.push({
          label: L.devil(d.id),
          href: `/wiki/demons/${d.id}`,
          count: d.count,
        })
      return
    case "zone":
      out.effects.push({ label: `Moved to ${L.zone(act.zoneID)}` })
      return
    case "homepoint":
      out.effects.push({ label: "Home Point set" })
      return
    case "quest":
      if (act.questID === questId) return
      if (act.phase === 0)
        out.effects.push({
          ...questRef(L, act.questID),
          label: `Starts “${L.quest(act.questID)}”`,
        })
      else if (act.phase === -1)
        out.effects.push({
          ...questRef(L, act.questID),
          label: `Completes “${L.quest(act.questID)}”`,
        })
      return
  }
}

function triggerVerb(
  L: Lookups,
  t: QuestGuideTrigger
): Pick<QuestRoute, "verb" | "targets"> {
  switch (t.kind) {
    case "npc": {
      const name = L.npcName(t.npcId)
      if (!name && t.grid) {
        // Nameless map gimmicks (reactor panels, doors): the grid says where.
        return {
          verb: "Interact with",
          targets: [{ label: "the object here" }],
        }
      }
      return {
        verb: "Talk to",
        targets: [{ label: name ?? `NPC #${t.npcId}` }],
      }
    }
    case "object":
      return { verb: "Examine", targets: [{ label: `object #${t.objectId}` }] }
    case "spot":
      return { verb: "Walk into", targets: [{ label: "the marked area" }] }
    case "defeat":
      return { verb: "Defeat", targets: [{ label: "the enemy group" }] }
    case "zone":
      return { verb: "Happens on", targets: [{ label: "entering the area" }] }
    default:
      return { verb: "Happens", targets: [{ label: "automatically" }] }
  }
}

function gridOf(t: QuestGuideTrigger): { x: number; y: number } | null {
  return t.grid ? { x: t.grid[0], y: t.grid[1] } : null
}

function sameSpot(a: QuestGuideTrigger, b: QuestGuideTrigger): boolean {
  return (
    a.kind === b.kind &&
    a.zoneID === b.zoneID &&
    a.npcId === b.npcId &&
    a.objectId === b.objectId &&
    a.spotId === b.spotId
  )
}

/** Conversations in order; back-to-back visits to one NPC become one line. */
function buildTalks(L: Lookups, talks: QuestGuideTalk[]): QuestTalk[] {
  const out: QuestTalk[] = []
  let lastTrigger: QuestGuideTrigger | null = null
  for (const talk of talks) {
    const items = talk.items ?? []
    const gains = items
      .filter((i) => i.count > 0)
      .map((i) => ({
        label: L.item(i.id),
        href: `/wiki/items/${i.id}`,
        count: i.count,
      }))
    const losses = items
      .filter((i) => i.count < 0)
      .map((i) => ({
        label: L.item(i.id),
        href: `/wiki/items/${i.id}`,
        count: -i.count,
      }))
    const prev = out.at(-1)
    if (
      prev &&
      lastTrigger &&
      !prev.random &&
      !talk.random &&
      sameSpot(lastTrigger, talk.trigger)
    ) {
      prev.choices.push(...talk.choices)
      prev.gains.push(...gains)
      prev.losses.push(...losses)
      continue
    }
    lastTrigger = talk.trigger
    out.push({
      ...triggerVerb(L, talk.trigger),
      where: L.zone(talk.trigger.zoneID),
      grid: gridOf(talk.trigger),
      choices: [...talk.choices],
      gains,
      losses,
      random: Boolean(talk.random),
    })
  }
  return out
}

function buildRoute(
  L: Lookups,
  questId: number,
  step: QuestGuideStep
): QuestRoute {
  const trigger = triggerVerb(L, step.trigger)
  const speaker = step.trigger.kind === "npc" ? L.npc(step.trigger.npcId) : null
  const fights = (step.fights ?? []).map((f) => ({
    where: L.zone(f.zoneID),
    enemies: f.enemies.map((e) => ({
      label: L.devil(e.type),
      href: `/wiki/demons/${e.type}`,
      count: e.count,
    })),
  }))
  // A step started by beating a spawn: name the enemies in the main line.
  if (step.trigger.kind === "defeat" && fights[0]?.enemies.length) {
    trigger.targets = fights.shift()!.enemies
  }
  const sequence = buildTalks(L, step.sequence ?? [])
  const roll = sequence.find((t) => t.random)
  const route: QuestRoute = {
    ...trigger,
    where: L.zone(step.trigger.zoneID),
    grid: gridOf(step.trigger),
    choices: step.choices ?? [],
    needs: (step.conditions ?? []).map((c) => formatGuideCondition(L, c)),
    fights,
    gains: [],
    losses: [],
    effects: [],
    dialogue: (step.dialogue ?? []).map((line) => ({
      kind: line.who,
      speaker: line.who === "npc" ? speaker : line.who === "you" ? "You" : null,
      text: line.text,
    })),
    eventId: step.eventId,
    file: step.file,
    sequence,
    when: roll?.gains.length
      ? `If ${roll.targets.map((t) => t.label).join(", ")} gives you ${roll.gains
          .map((g) => g.label)
          .join(", ")}`
      : null,
  }
  for (const act of step.actions ?? []) sortAction(L, questId, act, route)
  return route
}

function requirementRefs(quest: QuestRecord, index: number): QuestRef[] {
  const phase = quest.phases?.[index]
  return (phase?.requirements ?? [])
    .map(formatQuestRequirement)
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .map((r) => ({ label: r.label, href: r.href, count: r.count }))
}

/** Slim row for the client-side quest browser (no journal text). */
export type WikiQuestRow = {
  id: number
  title: string
  type: string
  npc: string | null
  zone: string
  levelMin: number | null
  hasGuide: boolean
}

/** A quest that hands out an item (wiki item page "From quests"). */
export type ItemQuestSource = {
  questId: number
  title: string
  count: number
  /** true = on turn-in; false = handed over partway through the quest. */
  reward: boolean
}

let itemQuestIndex: {
  guides: object
  byItem: Map<number, ItemQuestSource[]>
} | null = null

export function listItemQuestSources(itemId: number): ItemQuestSource[] {
  const guides = loadQuestGuidesPayload().byQuestId
  if (itemQuestIndex?.guides !== guides) {
    const byItem = new Map<number, ItemQuestSource[]>()
    for (const guide of Object.values(guides)) {
      const steps: [QuestGuideStep, boolean][] = [
        ...guide.start.map((s): [QuestGuideStep, boolean] => [s, false]),
        ...guide.phases
          .flat()
          .map((s): [QuestGuideStep, boolean] => [s, false]),
        ...guide.complete.map((s): [QuestGuideStep, boolean] => [s, true]),
      ]
      const seen = new Set<number>()
      for (const [step, reward] of steps) {
        for (const act of step.actions ?? []) {
          if (act.type !== "items") continue
          for (const { id, count } of act.items) {
            if (count <= 0 || seen.has(id)) continue
            seen.add(id)
            const rows = byItem.get(id) ?? []
            rows.push({
              questId: guide.id,
              title: getQuestById(guide.id)?.title ?? `Quest ${guide.id}`,
              count,
              reward,
            })
            byItem.set(id, rows)
          }
        }
      }
    }
    itemQuestIndex = { guides, byItem }
  }
  return itemQuestIndex.byItem.get(itemId) ?? []
}

export function listWikiQuestRows(): WikiQuestRow[] {
  const L = lookups()
  const guides = loadQuestGuidesPayload().byQuestId
  return loadQuestsPayload().quests.map((q) => {
    const guide = guides[String(q.id)]
    const level = (q.startConditions ?? [])
      .flatMap((g) => g.clauses ?? [])
      .filter((c) => c.type === "LEVEL")
      .map((c) => c.value1 ?? 0)
    return {
      id: q.id,
      title: q.title ?? `Quest ${q.id}`,
      type: q.type,
      npc: q.npc && q.npc !== "-" ? q.npc : null,
      zone: L.zone(q.zoneID) ?? "—",
      levelMin: guide?.levelMin ?? (level.length ? Math.max(...level) : null),
      hasGuide: Boolean(guide),
    }
  })
}

function talkKey(t: QuestTalk): string {
  return JSON.stringify([
    t.verb,
    t.targets.map((r) => r.label),
    t.where,
    t.grid,
    t.random,
  ])
}

function commonWords(texts: string[], fromEnd: boolean): string[] {
  const split = texts.map((t) => {
    const words = t.split(" ")
    return fromEnd ? words.reverse() : words
  })
  const out: string[] = []
  for (let i = 0; split.every((w) => i < w.length - 1); i++) {
    if (!split.every((w) => w[i] === split[0][i])) break
    out.push(split[0][i])
  }
  return fromEnd ? out.reverse() : out
}

/** Fold same-stop routes whose only difference is one answer order. */
export function mergeVariants(routes: QuestRoute[]): QuestVariantTable | null {
  if (routes.length < 2) return null
  const stops = routes[0].sequence.length
  if (!stops || routes.some((r) => r.sequence.length !== stops)) return null
  for (let i = 0; i < stops; i++) {
    const key = talkKey(routes[0].sequence[i])
    if (routes.some((r) => talkKey(r.sequence[i]) !== key)) return null
  }
  const rollAt = routes[0].sequence.findIndex((t) => t.random)
  const varying = [...Array(stops).keys()].filter(
    (i) =>
      i !== rollAt &&
      routes.some(
        (r) =>
          JSON.stringify(r.sequence[i].choices) !==
          JSON.stringify(routes[0].sequence[i].choices)
      )
  )
  if (rollAt < 0 || varying.length !== 1) return null
  const orderAt = varying[0]

  const answers = routes.flatMap((r) => r.sequence[orderAt].choices)
  const prefix = commonWords(answers, false)
  const suffix = commonWords(answers, true)
  const trim = (text: string) =>
    text
      .split(" ")
      .slice(prefix.length, text.split(" ").length - suffix.length)
      .join(" ")

  const talks = routes[0].sequence.map((t, i) => ({
    ...t,
    choices: i === orderAt ? [] : t.choices,
    // The order table says what gets handed in at this stop.
    losses: i === orderAt ? [] : t.losses,
    // The random stop can hand out any of the variants' picks.
    gains:
      i === rollAt
        ? [
            ...new Map(
              routes
                .flatMap((r) => r.sequence[rollAt].gains)
                .map((g) => [g.label, g])
            ).values(),
          ]
        : t.gains,
  }))
  return {
    talks,
    orderAt,
    prefix: prefix.join(" "),
    suffix: suffix.join(" "),
    rows: routes.map((r) => ({
      when: r.sequence[rollAt].gains,
      order: r.sequence[orderAt].choices.map(trim),
    })),
    route: routes[0],
  }
}

const JOURNAL_PHASE_IMAGE_RX = /qid_\d+_p(\d+)_/

/**
 * Journal line → phase index. Lines run in phase order, but a few quests
 * skip phases with no journal text; their hint images (`qid_303_p08_01.dds`)
 * name the phase, so those re-anchor the count.
 */
export function mapJournalToPhases(lines: string[]): Map<number, string> {
  const out = new Map<number, string>()
  let phase = 0
  for (const raw of lines) {
    const { text, imageRefs } = parseQuestJournalLine(raw)
    const anchor = imageRefs
      .map((ref) => JOURNAL_PHASE_IMAGE_RX.exec(ref)?.[1])
      .find(Boolean)
    if (anchor && Number(anchor) - 1 >= phase) phase = Number(anchor) - 1
    // Journal text is hard-wrapped for the client's quest window.
    const flat = text.replace(/\s*\n\s*/g, " ").trim()
    if (flat) out.set(phase, flat)
    phase++
  }
  return out
}

/**
 * Line journal objectives up with the event steps that finish them.
 *
 * Journal line i is shown while the quest sits at phase i; the update that
 * sets phase i+1 (or completes, for the last line) is how you finish it.
 */
export function buildQuestWalkthrough(quest: QuestRecord): QuestWalkthrough {
  const L = lookups()
  const guide: QuestGuide | undefined = getQuestGuide(quest.id)
  const routes = (steps: QuestGuideStep[] = []) =>
    steps.map((s) => buildRoute(L, quest.id, s))

  const byPhase = new Map<number, QuestGuideStep[]>()
  for (const variants of guide?.phases ?? []) {
    if (variants[0]) byPhase.set(variants[0].phase, variants)
  }
  const journalByPhase = mapJournalToPhases(quest.lines ?? [])
  const objectiveCount = Math.max(
    journalByPhase.size ? Math.max(...journalByPhase.keys()) + 1 : 0,
    quest.phases?.length ?? 0,
    1
  )

  const steps: QuestWalkStep[] = []
  if (guide?.start.length) {
    steps.push({
      key: "start",
      kind: "start",
      title: "Accept the quest",
      journal: null,
      requirements: [],
      routes: routes(guide.start),
      table: null,
    })
  }
  for (let i = 0; i < objectiveCount; i++) {
    const last = i === objectiveCount - 1
    const finish = last ? guide?.complete : byPhase.get(i + 1)
    byPhase.delete(i + 1)
    steps.push({
      key: `objective-${i}`,
      kind: last ? "complete" : "objective",
      title: last ? "Finish" : `Objective ${i + 1}`,
      journal: journalByPhase.get(i) ?? null,
      requirements: requirementRefs(quest, i),
      routes: routes(finish),
      table: null,
    })
  }
  // Phases the journal doesn't mention (hidden steps) go before the finish.
  const extra = [...byPhase.entries()].sort((a, b) => a[0] - b[0])
  if (extra.length) {
    const finishStep = steps.pop()!
    for (const [phase, variants] of extra) {
      steps.push({
        key: `phase-${phase}`,
        kind: "objective",
        title: `Hidden step ${phase}`,
        journal: null,
        requirements: [],
        routes: routes(variants),
        table: null,
      })
    }
    steps.push(finishStep)
  }

  const prerequisites = (guide?.prerequisites ?? []).map((id) =>
    questRef(L, id)
  )
  const shownElsewhere = new Set(prerequisites.map((p) => p.href))
  for (const step of steps) {
    step.table = mergeVariants(step.routes)
    // The header already lists prerequisite quests.
    for (const route of step.routes) {
      route.needs = route.needs.filter((n) => !shownElsewhere.has(n.href))
    }
  }

  const finishRoute = steps.at(-1)?.routes[0]
  const rewards = finishRoute
    ? [
        ...finishRoute.gains,
        ...finishRoute.effects.filter((e) => e.label.startsWith("Alignment")),
      ]
    : []

  const startNeeds = (guide?.start ?? []).flatMap((s) => s.conditions ?? [])
  const lnc = [
    ...startNeeds
      .filter((c) => c.type === "LNC_TYPE")
      .map((c) => c.value1 ?? -1),
    ...(quest.startConditions ?? []).flatMap((g) =>
      (g.clauses ?? [])
        .filter((c) => c.type === "LNC_TYPE")
        .map((c) => c.value1 ?? -1)
    ),
  ]
  const levelFromStart = startNeeds
    .filter((c) => c.type === "LEVEL" && c.compareMode !== "LT")
    .map((c) => c.value1 ?? 0)

  return {
    hasGuide: Boolean(guide),
    giver:
      (quest.npc && quest.npc !== "-" ? quest.npc : null) ??
      (guide?.start[0]?.trigger.kind === "npc"
        ? L.npc(guide.start[0].trigger.npcId)
        : null),
    location: L.zone(quest.zoneID) ?? null,
    coords:
      quest.coordinates &&
      !(quest.coordinates.x === -1 && quest.coordinates.y === -1)
        ? quest.coordinates
        : null,
    levelMin:
      guide?.levelMin ??
      (levelFromStart.length ? Math.max(...levelFromStart) : null),
    alignment: lnc.length ? (LNC_TYPE_LABELS[lnc[0]] ?? null) : null,
    repeatable: quest.type === "REPEATABLE",
    prerequisites,
    unlocks: [
      ...new Set([
        ...(guide?.unlocks ?? []),
        ...(quest.nextQuests ?? [])
          .map((n) => n.questID ?? 0)
          .filter((id) => id > 0),
      ]),
    ].map((id) => questRef(L, id)),
    rewards,
    steps,
  }
}
