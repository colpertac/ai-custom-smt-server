"use client"

import Image from "next/image"
import Link from "next/link"
import { useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"

import type {
  DevilAlignment,
  DevilCatalogEntry,
  DevilResistKind,
} from "@/lib/armory-catalogs"
import {
  DEVIL_RESIST_ELEMS_LIST,
  DEVIL_RESIST_ICON,
  DEVIL_RESIST_TITLE,
  DEVIL_VARIANT_TAGS,
  devilResistKind,
} from "@/lib/armory-catalogs"
import {
  WIKI_PAGE_SIZE,
  WikiPagination,
} from "@/features/wiki/components/WikiPagination"
import { WikiPageHeader } from "@/features/wiki/components/WikiShell"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const RACE_ALIGN_CLASS: Record<DevilAlignment, string> = {
  law: "text-sky-400",
  neutral: "text-emerald-400",
  chaos: "text-rose-400",
}

const RESIST_KIND_CLASS: Record<DevilResistKind, string> = {
  normal: "text-muted-foreground",
  weak: "text-rose-400 font-semibold",
  resist: "text-cyan-300",
  null: "text-foreground",
  repel: "text-cyan-300",
  drain: "text-emerald-400",
}

type VariantScope = "stock" | "all" | "variants"

type AffinityKindFilter = "" | "weak" | "resist" | "null" | "repel" | "drain"

const AFFINITY_KIND_OPTIONS: { value: AffinityKindFilter; label: string }[] = [
  { value: "", label: "Any special" },
  { value: "weak", label: "Weak" },
  { value: "resist", label: "Resist" },
  { value: "null", label: "Null" },
  { value: "repel", label: "Repel" },
  { value: "drain", label: "Drain" },
]

const VARIANT_CHIP_TAGS = [...DEVIL_VARIANT_TAGS, "Instance", "Other"] as const

function filterDevils(
  all: DevilCatalogEntry[],
  query: string,
  scope: VariantScope,
  race: string | null,
  affinityElem: string | null,
  affinityKind: AffinityKindFilter,
  variantTags: Set<string>
): DevilCatalogEntry[] {
  const q = query.trim().toLowerCase()
  return all.filter((d) => {
    if (scope === "stock" && !d.isStock) return false
    if (scope === "variants" && d.isStock) return false

    if (race && d.race !== race) return false

    if (affinityElem) {
      const kind = devilResistKind(d.resists[affinityElem] ?? "")
      if (affinityKind) {
        if (kind !== affinityKind) return false
      } else if (kind === "normal") {
        return false
      }
    }

    if (variantTags.size > 0) {
      if (!d.variantTag || !variantTags.has(d.variantTag)) return false
    }

    if (!q) return true
    const idStr = String(d.id)
    if (idStr === q || idStr.startsWith(q)) return true
    if (d.name.toLowerCase().includes(q)) return true
    if (d.race.toLowerCase().includes(q)) return true
    if (d.variantTag?.toLowerCase().includes(q)) return true
    return false
  })
}

function AffinityHeader({ elem }: { elem: string }) {
  const icon = DEVIL_RESIST_ICON[elem]
  const title = DEVIL_RESIST_TITLE[elem] ?? elem
  if (!icon) {
    return <span className="text-[10px] uppercase">{elem.slice(0, 2)}</span>
  }
  return (
    <Image
      src={`/wiki/affinity/${icon}.jpeg`}
      alt={title}
      title={title}
      width={20}
      height={20}
      className="mx-auto size-5 object-contain"
      unoptimized
    />
  )
}

function ResistCell({ value, elem }: { value: string; elem: string }) {
  const kind = devilResistKind(value)
  if (kind === "normal") {
    return (
      <td
        className="px-0.5 py-1 text-center"
        title={DEVIL_RESIST_TITLE[elem]}
      />
    )
  }
  return (
    <td
      className={cn(
        "px-0.5 py-1 text-center font-mono text-[11px] leading-none",
        RESIST_KIND_CLASS[kind]
      )}
      title={`${DEVIL_RESIST_TITLE[elem] ?? elem}: ${value}`}
    >
      {value}
    </td>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant={active ? "default" : "outline"}
      className={cn(
        "tracking-wider uppercase",
        !active && "text-muted-foreground"
      )}
      onClick={onClick}
    >
      {label}
    </Button>
  )
}

export function WikiDemonsPanel({ demons }: { demons: DevilCatalogEntry[] }) {
  const searchParams = useSearchParams()
  const initialQuery = searchParams.get("q")?.trim() ?? ""
  const [query, setQuery] = useState(initialQuery)
  const [scope, setScope] = useState<VariantScope>("stock")
  const [race, setRace] = useState<string | null>(null)
  const [affinityElem, setAffinityElem] = useState<string | null>(null)
  const [affinityKind, setAffinityKind] = useState<AffinityKindFilter>("")
  const [variantTags, setVariantTags] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(0)

  const resistElems = demons[0]?.resistElems ?? []
  const listResistElems =
    resistElems.length > 0
      ? DEVIL_RESIST_ELEMS_LIST.filter((e) => resistElems.includes(e))
      : [...DEVIL_RESIST_ELEMS_LIST]

  const races = useMemo(() => {
    const set = new Set<string>()
    for (const d of demons) {
      if (d.race) set.add(d.race)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [demons])

  const stockCount = useMemo(
    () => demons.filter((d) => d.isStock).length,
    [demons]
  )

  const filtered = useMemo(
    () =>
      filterDevils(
        demons,
        query,
        scope,
        race,
        affinityElem,
        affinityKind,
        variantTags
      ),
    [demons, query, scope, race, affinityElem, affinityKind, variantTags]
  )

  const total = filtered.length
  const pageCount = Math.max(1, Math.ceil(total / WIKI_PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const slice = filtered.slice(
    safePage * WIKI_PAGE_SIZE,
    (safePage + 1) * WIKI_PAGE_SIZE
  )

  const resetPage = () => setPage(0)

  const setQueryAndReset = (value: string) => {
    setQuery(value)
    resetPage()
  }
  const setScopeAndReset = (value: VariantScope) => {
    setScope(value)
    if (value === "stock") setVariantTags(new Set())
    resetPage()
  }
  const setRaceAndReset = (value: string | null) => {
    setRace(value)
    resetPage()
  }
  const setAffinityElemAndReset = (value: string | null) => {
    setAffinityElem(value)
    if (!value) setAffinityKind("")
    resetPage()
  }
  const setAffinityKindAndReset = (value: AffinityKindFilter) => {
    setAffinityKind(value)
    resetPage()
  }
  const toggleVariantTag = (tag: string) => {
    setVariantTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
    resetPage()
  }

  const filtersActive = Boolean(
    query.trim() ||
    scope !== "stock" ||
    race ||
    affinityElem ||
    variantTags.size > 0
  )

  return (
    <div className="space-y-6">
      <WikiPageHeader
        title="Demons"
        description={`${stockCount.toLocaleString()} stock forms · ${demons.length.toLocaleString()} DevilData entries. Use the ID with @contract (e.g. @contract 105). Race color is Law / Neutral / Chaos from LNC. Stats and resists are base CorrectTbl values from BinaryData (before level growth).`}
      />

      <p className="text-xs text-muted-foreground">
        Affinities: empty = ×1 ·{" "}
        <span className={RESIST_KIND_CLASS.resist}>0.75 0.5 0.25</span> resist ·{" "}
        <span className={RESIST_KIND_CLASS.weak}>1.25 1.5 2</span> weak ·{" "}
        <span className={RESIST_KIND_CLASS.null}>nu</span> null ·{" "}
        <span className={RESIST_KIND_CLASS.repel}>rp</span> repel ·{" "}
        <span className={RESIST_KIND_CLASS.drain}>dr</span> drain
      </p>

      <div className="flex flex-wrap gap-2">
        <FilterChip
          label="Stock only"
          active={scope === "stock"}
          onClick={() => setScopeAndReset("stock")}
        />
        <FilterChip
          label="Include variants"
          active={scope === "all"}
          onClick={() => setScopeAndReset("all")}
        />
        <FilterChip
          label="Variants only"
          active={scope === "variants"}
          onClick={() => setScopeAndReset("variants")}
        />
      </div>

      <div className="grid gap-4 border border-border bg-card/40 p-4 sm:grid-cols-2 sm:items-end lg:grid-cols-[minmax(0,1.4fr)_minmax(0,11rem)_minmax(0,11rem)_minmax(0,10rem)_auto]">
        <Field>
          <FieldLabel htmlFor="wiki-filter-demons">Filter demons</FieldLabel>
          <Input
            id="wiki-filter-demons"
            value={query}
            onChange={(e) => setQueryAndReset(e.target.value)}
            placeholder="Name, race, variant, or demon ID…"
            autoComplete="off"
            autoFocus
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="wiki-filter-race">Race</FieldLabel>
          <select
            id="wiki-filter-race"
            className="flex h-9 w-full rounded-none border border-border bg-background px-2 text-sm"
            value={race ?? ""}
            onChange={(e) => setRaceAndReset(e.target.value || null)}
          >
            <option value="">Any race</option>
            {races.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="wiki-filter-affinity">Affinity</FieldLabel>
          <select
            id="wiki-filter-affinity"
            className="flex h-9 w-full rounded-none border border-border bg-background px-2 text-sm"
            value={affinityElem ?? ""}
            onChange={(e) => setAffinityElemAndReset(e.target.value || null)}
          >
            <option value="">Any affinity</option>
            {resistElems.map((elem) => (
              <option key={elem} value={elem}>
                {DEVIL_RESIST_TITLE[elem] ?? elem}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="wiki-filter-affinity-kind">
            Affinity kind
          </FieldLabel>
          <select
            id="wiki-filter-affinity-kind"
            className="flex h-9 w-full rounded-none border border-border bg-background px-2 text-sm disabled:opacity-50"
            value={affinityKind}
            disabled={!affinityElem}
            onChange={(e) =>
              setAffinityKindAndReset(e.target.value as AffinityKindFilter)
            }
          >
            {AFFINITY_KIND_OPTIONS.map((opt) => (
              <option key={opt.value || "any"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
        <p className="text-xs text-muted-foreground sm:pb-2">
          {filtersActive
            ? `${total.toLocaleString()} match${total === 1 ? "" : "es"}`
            : `${total.toLocaleString()} demons`}
        </p>
      </div>

      {scope !== "stock" ? (
        <div className="flex flex-wrap gap-2">
          <FilterChip
            label="All tags"
            active={variantTags.size === 0}
            onClick={() => {
              setVariantTags(new Set())
              resetPage()
            }}
          />
          {VARIANT_CHIP_TAGS.map((tag) => (
            <FilterChip
              key={tag}
              label={tag}
              active={variantTags.has(tag)}
              onClick={() => toggleVariantTag(tag)}
            />
          ))}
        </div>
      ) : null}

      <WikiPagination page={safePage} total={total} onPageChange={setPage} />

      {slice.length === 0 ? (
        <div className="border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
          No demons match. Try another name, race, affinity, or variant filter.
        </div>
      ) : (
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[58rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs tracking-wider text-muted-foreground uppercase">
                <th className="px-2 py-2 font-medium" />
                <th className="px-2 py-2 font-medium">ID</th>
                <th className="px-2 py-2 font-medium">Name</th>
                <th className="px-2 py-2 font-medium">Lv</th>
                <th className="px-2 py-2 font-medium">Race</th>
                <th className="px-2 py-2 font-medium">HP</th>
                <th className="px-2 py-2 font-medium">MP</th>
                <th className="px-2 py-2 font-medium">St</th>
                <th className="px-2 py-2 font-medium">Ma</th>
                <th className="px-2 py-2 font-medium">Vi</th>
                <th className="px-2 py-2 font-medium">In</th>
                <th className="px-2 py-2 font-medium">Ag</th>
                <th className="px-2 py-2 font-medium">Lu</th>
                {listResistElems.map((elem) => (
                  <th
                    key={elem}
                    className="px-0.5 py-2 text-center font-medium"
                  >
                    <AffinityHeader elem={elem} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.map((d) => (
                <tr
                  key={d.id}
                  className="border-b border-border/80 transition-colors hover:bg-muted/30"
                >
                  <td className="px-1.5 py-1">
                    <Link href={`/wiki/demons/${d.id}`} className="block">
                      {d.iconSrc ? (
                        <Image
                          src={d.iconSrc}
                          alt=""
                          width={28}
                          height={28}
                          className="size-7 object-contain"
                          unoptimized
                        />
                      ) : (
                        <span className="block size-7 bg-muted/40" />
                      )}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 font-mono tabular-nums">
                    <Link
                      href={`/wiki/demons/${d.id}`}
                      className="text-foreground hover:text-gold-hot"
                    >
                      {d.id}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <Link
                      href={`/wiki/demons/${d.id}`}
                      className="text-foreground hover:text-gold-hot"
                    >
                      {d.name}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 font-mono tabular-nums">
                    {d.level || "—"}
                  </td>
                  <td
                    className={cn(
                      "px-2 py-1.5 font-medium whitespace-nowrap",
                      RACE_ALIGN_CLASS[d.alignment]
                    )}
                    title={`${d.alignment} (LNC ${d.lnc})`}
                  >
                    {d.race}
                  </td>
                  <td className="px-2 py-1.5 font-mono tabular-nums">
                    {d.stats.hp || "—"}
                  </td>
                  <td className="px-2 py-1.5 font-mono tabular-nums">
                    {d.stats.mp || "—"}
                  </td>
                  <td className="px-2 py-1.5 font-mono tabular-nums">
                    {d.stats.str}
                  </td>
                  <td className="px-2 py-1.5 font-mono tabular-nums">
                    {d.stats.magic}
                  </td>
                  <td className="px-2 py-1.5 font-mono tabular-nums">
                    {d.stats.vit}
                  </td>
                  <td className="px-2 py-1.5 font-mono tabular-nums">
                    {d.stats.int}
                  </td>
                  <td className="px-2 py-1.5 font-mono tabular-nums">
                    {d.stats.speed}
                  </td>
                  <td className="px-2 py-1.5 font-mono tabular-nums">
                    {d.stats.luck}
                  </td>
                  {listResistElems.map((elem) => (
                    <ResistCell
                      key={elem}
                      elem={elem}
                      value={d.resists[elem] ?? ""}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <WikiPagination page={safePage} total={total} onPageChange={setPage} />
    </div>
  )
}
