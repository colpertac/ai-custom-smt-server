import { ChevronRight, MapPin } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { WikiBreadcrumb } from "@/features/wiki/components/WikiShell"
import { WIKI_QUESTS_META } from "@/features/wiki/wiki-nav"
import type { QuestRecord } from "@/lib/quest-catalog-load"
import { cn } from "@/lib/utils"
import type {
  QuestDialogueLine,
  QuestRef,
  QuestRoute,
  QuestTalk,
  QuestVariantTable,
  QuestWalkStep,
  QuestWalkthrough,
} from "@/lib/wiki-quest-guide"

/** Card / key colours named in answers ("Insert Blue Card") get a swatch. */
const SWATCHES: Record<string, string> = {
  red: "#d9534f",
  blue: "#5b80d8",
  yellow: "#e3c84b",
  black: "#101010",
  white: "#ececec",
  green: "#4fae6a",
  purple: "#9a6cd6",
  orange: "#e08a3c",
  pink: "#e57fb0",
  gold: "#d3b800",
  silver: "#b8bec9",
}

function Swatch({ word }: { word: string }) {
  const color = SWATCHES[word.toLowerCase()]
  if (!color) return null
  return (
    <span
      aria-hidden
      className="mr-1 inline-block size-2.5 rounded-full align-[-1px] ring-1 ring-border"
      style={{ backgroundColor: color }}
    />
  )
}

function Ref({ refItem }: { refItem: QuestRef }) {
  return (
    <>
      {refItem.count != null && refItem.count > 1 ? (
        <span className="mr-1 text-muted-foreground tabular-nums">
          {refItem.count.toLocaleString()}×
        </span>
      ) : null}
      {refItem.href ? (
        <Link
          href={refItem.href}
          className="text-gold-dim no-underline hover:text-gold-hot"
        >
          {refItem.label}
        </Link>
      ) : (
        <span>{refItem.label}</span>
      )}
      {refItem.note ? (
        <span className="ml-1 text-xs text-muted-foreground">
          ({refItem.note})
        </span>
      ) : null}
    </>
  )
}

function RefList({ refs, sep = ", " }: { refs: QuestRef[]; sep?: string }) {
  return (
    <>
      {refs.map((r, i) => (
        <span key={`${r.label}-${i}`}>
          {i > 0 ? <span className="text-muted-foreground">{sep}</span> : null}
          <Ref refItem={r} />
        </span>
      ))}
    </>
  )
}

/** "Shinjuku Docks · X24 Y36" — where to go, with map grid when known. */
function Place({
  where,
  grid,
}: {
  where: string | null
  grid: { x: number; y: number } | null
}) {
  if (!where && !grid) return null
  return (
    <span className="ml-1.5 inline-flex items-baseline gap-1 text-xs whitespace-nowrap text-muted-foreground">
      <MapPin className="size-3 shrink-0 self-center" aria-hidden />
      {where}
      {grid ? (
        <span
          className="font-mono text-gold-dim"
          title="Map grid square — open the in-game map"
        >
          {where ? "· " : null}X{grid.x} Y{grid.y}
        </span>
      ) : null}
    </span>
  )
}

function Action({ talk }: { talk: QuestTalk | QuestRoute }) {
  return (
    <p className="leading-snug">
      <span className="text-muted-foreground">{talk.verb} </span>
      <span className="font-medium text-foreground">
        <RefList refs={talk.targets} />
      </span>
      <Place where={talk.where} grid={talk.grid} />
    </p>
  )
}

function Answers({ choices }: { choices: string[] }) {
  if (!choices.length) return null
  return (
    <p className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[0.8rem]">
      <span className="mr-0.5 text-xs text-muted-foreground">Pick</span>
      {choices.map((c, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 ? (
            <ChevronRight
              className="size-3 text-muted-foreground"
              aria-hidden
            />
          ) : null}
          <span className="bg-muted/60 px-1.5 py-px whitespace-nowrap text-foreground/90">
            {c}
          </span>
        </span>
      ))}
    </p>
  )
}

/** One line of what changes hands: + gains, − hand-ins, other effects. */
function Exchange({
  gains,
  losses,
  effects = [],
  needs = [],
}: {
  gains: QuestRef[]
  losses: QuestRef[]
  effects?: QuestRef[]
  needs?: QuestRef[]
}) {
  if (!gains.length && !losses.length && !effects.length && !needs.length)
    return null
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[0.8rem]">
      {needs.length ? (
        <span>
          <span className="text-muted-foreground">Needs </span>
          <RefList refs={needs} />
        </span>
      ) : null}
      {losses.map((r, i) => (
        <span key={`l${i}`}>
          <span className="mr-0.5 font-mono text-destructive">−</span>
          <Ref refItem={r} />
        </span>
      ))}
      {gains.map((r, i) => (
        <span key={`g${i}`}>
          <span className="mr-0.5 font-mono text-gold-dim">+</span>
          <Ref refItem={r} />
        </span>
      ))}
      {effects.map((r, i) => (
        <span key={`e${i}`} className="text-muted-foreground">
          <Ref refItem={r} />
        </span>
      ))}
    </p>
  )
}

function Fights({ route }: { route: QuestRoute }) {
  return (
    <>
      {route.fights.map((f, i) => (
        <p key={i} className="text-[0.8rem]">
          <span className="text-muted-foreground">Fight </span>
          {f.enemies.length ? <RefList refs={f.enemies} /> : "enemies"}
          <Place where={f.where} grid={null} />
        </p>
      ))}
    </>
  )
}

function Dialogue({
  lines,
  eventId,
  file,
}: {
  lines: QuestDialogueLine[]
  eventId: string
  file?: string
}) {
  if (!lines.length) return null
  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="size-3 transition-transform group-open:rotate-90"
          aria-hidden
        />
        Dialogue
      </summary>
      <ol className="mt-1.5 space-y-1 border-l border-border pl-3 text-[0.8rem]">
        {lines.map((line, i) => (
          <li
            key={i}
            className={cn(
              "leading-snug whitespace-pre-line",
              line.kind === "you" && "text-gold-dim",
              (line.kind === "system" || line.kind === "scene") &&
                "text-muted-foreground italic"
            )}
          >
            {line.speaker ? (
              <span className="mr-1.5 font-medium text-foreground/80">
                {line.speaker}:
              </span>
            ) : null}
            {line.kind === "you" ? `“${line.text}”` : line.text}
          </li>
        ))}
      </ol>
      <p className="mt-1 pl-3 font-mono text-[0.6rem] text-muted-foreground/70">
        {eventId}
        {file ? ` · ${file}` : null}
      </p>
    </details>
  )
}

/** Lettered stops inside one step (multi-conversation routes). */
function Stops({
  talks,
  after,
}: {
  talks: QuestTalk[]
  after?: (index: number) => ReactNode
}) {
  return (
    <ol className="space-y-1.5">
      {talks.map((talk, i) => (
        <li key={i} className="grid grid-cols-[1.1rem_1fr] gap-x-1">
          <span className="pt-px font-mono text-xs text-muted-foreground tabular-nums">
            {String.fromCharCode(97 + i)}.
          </span>
          <div className="min-w-0 space-y-1">
            <Action talk={talk} />
            <Answers choices={talk.choices} />
            {talk.random && talk.gains.length ? (
              <p className="text-[0.8rem] text-muted-foreground">
                Gives one at random: <RefList refs={talk.gains} />
              </p>
            ) : (
              <Exchange gains={talk.gains} losses={talk.losses} />
            )}
            {after?.(i)}
          </div>
        </li>
      ))}
    </ol>
  )
}

function RouteView({ route }: { route: QuestRoute }) {
  const multi = route.sequence.length > 0
  return (
    <div className="space-y-1.5">
      {multi ? (
        <Stops talks={route.sequence} />
      ) : (
        <>
          <Action talk={route} />
          <Answers choices={route.choices} />
        </>
      )}
      <Fights route={route} />
      <Exchange
        needs={route.needs}
        gains={route.gains}
        losses={multi ? [] : route.losses}
        effects={route.effects}
      />
      <Dialogue
        lines={route.dialogue}
        eventId={route.eventId}
        file={route.file}
      />
    </div>
  )
}

function OrderTable({ table }: { table: QuestVariantTable }) {
  const pattern = [table.prefix, "…", table.suffix].filter(Boolean).join(" ")
  return (
    <div className="mt-1.5">
      <p className="text-[0.8rem] text-muted-foreground">
        {table.prefix || table.suffix ? (
          <>
            Pick “<span className="text-foreground/90">{pattern}</span>” in this
            order:
          </>
        ) : (
          "Pick in this order:"
        )}
      </p>
      <table className="mt-1 w-full border-collapse text-[0.8rem]">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="w-[1%] py-1 pr-4 font-normal whitespace-nowrap">
              If you got
            </th>
            <th className="py-1 font-normal">Order</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i} className="border-t border-border/60 align-top">
              <td className="py-1 pr-4 whitespace-nowrap">
                {row.when.map((r, j) => (
                  <span key={j}>
                    <Swatch word={r.label.split(" ")[0]} />
                    <Ref refItem={r} />
                  </span>
                ))}
              </td>
              <td className="py-1">
                <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                  {row.order.map((word, j) => (
                    <span key={j} className="inline-flex items-center gap-1">
                      {j > 0 ? (
                        <ChevronRight
                          className="size-3 text-muted-foreground"
                          aria-hidden
                        />
                      ) : null}
                      <span className="whitespace-nowrap">
                        <Swatch word={word} />
                        {word}
                      </span>
                    </span>
                  ))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TableView({ table }: { table: QuestVariantTable }) {
  const route = table.route
  return (
    <div className="space-y-1.5">
      <Stops
        talks={table.talks}
        after={(i) =>
          i === table.orderAt ? <OrderTable table={table} /> : null
        }
      />
      <Exchange
        needs={route.needs}
        gains={route.gains}
        losses={[]}
        effects={route.effects}
      />
      <Dialogue
        lines={route.dialogue}
        eventId={route.eventId}
        file={route.file}
      />
    </div>
  )
}

function StepItem({
  step,
  index,
  last,
}: {
  step: QuestWalkStep
  index: number
  last: boolean
}) {
  const heading = step.kind === "start" ? "Accept the quest" : step.journal
  const kicker =
    step.kind === "complete"
      ? "Turn in"
      : step.kind === "objective" && !step.journal
        ? "Not in the quest journal"
        : null
  return (
    <li className="grid grid-cols-[1.75rem_1fr] gap-x-3">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs tabular-nums",
            step.kind === "complete"
              ? "border-gold-dim text-gold-dim"
              : "border-border text-muted-foreground"
          )}
        >
          {index + 1}
        </span>
        {last ? null : <span className="mt-1 w-px flex-1 bg-border" />}
      </div>
      <div className={cn("min-w-0 space-y-1.5", last ? "pb-1" : "pb-6")}>
        <div className="pt-0.5">
          {kicker ? (
            <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-gold-dim uppercase">
              {kicker}
            </p>
          ) : null}
          {heading ? (
            <h3 className="text-[0.95rem] leading-snug text-foreground">
              {heading}
            </h3>
          ) : null}
        </div>
        {step.requirements.length ? (
          <p className="text-[0.8rem]">
            <span className="text-muted-foreground">Goal </span>
            <RefList refs={step.requirements} />
          </p>
        ) : null}
        {step.table ? (
          <TableView table={step.table} />
        ) : (
          step.routes.map((route, i) => (
            <div
              key={`${route.eventId}-${i}`}
              className={cn(
                i > 0 && "border-t border-dashed border-border/70 pt-2"
              )}
            >
              {route.when || step.routes.length > 1 ? (
                <p className="mb-1 text-xs text-gold-dim">
                  {route.when ?? `Option ${i + 1}`}
                </p>
              ) : null}
              <RouteView route={route} />
            </div>
          ))
        )}
      </div>
    </li>
  )
}

function Fact({
  label,
  children,
  wide,
}: {
  label: string
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className={cn("min-w-0", wide && "col-span-2")}>
      <dt className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
    </div>
  )
}

export function WikiQuestDetailView({
  quest,
  walkthrough,
}: {
  quest: QuestRecord
  walkthrough: QuestWalkthrough
}) {
  const w = walkthrough
  const title = quest.title ?? `Quest ${quest.id}`

  return (
    <div className="space-y-3">
      <WikiBreadcrumb
        segments={[
          { label: "Item wiki", href: "/wiki" },
          { label: WIKI_QUESTS_META.title, href: WIKI_QUESTS_META.href },
          { label: title },
        ]}
      />

      <article className="border border-border bg-card/40">
        <header className="border-b border-border px-4 py-3 sm:px-5">
          <p className="font-mono text-[0.7rem] tracking-wide text-muted-foreground uppercase">
            {quest.type} · #{quest.id}
            {w.repeatable ? " · repeatable" : null}
          </p>
          <h1 className="mt-0.5 font-heading text-xl leading-tight tracking-wide uppercase">
            {title}
          </h1>

          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
            <Fact label="Quest giver">{w.giver ?? "—"}</Fact>
            <Fact label="Location">
              {w.location ?? "—"}
              {w.coords ? (
                <span className="ml-1 font-mono text-xs text-gold-dim">
                  X{w.coords.x} Y{w.coords.y}
                </span>
              ) : null}
            </Fact>
            <Fact label="Level">{w.levelMin ? `${w.levelMin}+` : "Any"}</Fact>
            {w.alignment ? <Fact label="Alignment">{w.alignment}</Fact> : null}
            {w.prerequisites.length ? (
              <Fact label="Requires">
                <RefList refs={w.prerequisites} sep=" · " />
              </Fact>
            ) : null}
            {w.unlocks.length ? (
              <Fact label="Leads to" wide={w.unlocks.length > 1}>
                <RefList refs={w.unlocks} sep=" · " />
              </Fact>
            ) : null}
            {w.rewards.length ? (
              <Fact label="Rewards">
                <RefList refs={w.rewards} sep=" · " />
              </Fact>
            ) : null}
          </dl>
          {quest.restrictionText ? (
            <p className="mt-3 text-sm text-foreground/90">
              {quest.restrictionText}
            </p>
          ) : null}
        </header>

        <section className="px-4 py-4 sm:px-5">
          <h2 className="font-heading text-xs font-semibold tracking-[0.12em] text-gold-dim uppercase">
            Walkthrough
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {w.hasGuide ? (
              <>
                Generated automatically from the server&apos;s quest scripts —
                not hand-written, so no tips or nuance, and map X/Y can be off
                by a square.{" "}
                <Link
                  href="/feedback"
                  className="text-gold-dim no-underline hover:text-gold-hot"
                >
                  Report a problem
                </Link>
              </>
            ) : (
              "No event script for this quest on this server — journal text only."
            )}
          </p>
          <ol className="mt-3 max-w-3xl">
            {w.steps.map((step, i) => (
              <StepItem
                key={step.key}
                step={step}
                index={i}
                last={i === w.steps.length - 1}
              />
            ))}
          </ol>
        </section>
      </article>
    </div>
  )
}
