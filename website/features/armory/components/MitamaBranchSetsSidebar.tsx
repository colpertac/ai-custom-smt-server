"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  MITAMA_SPIRIT_OPTIONS,
  REUNION_BRANCH_NAMES,
  getMitamaSpiritOption,
} from "@/lib/demon-reunion-edit-shared"
import {
  MITAMA_BRANCH_SET_BONUSES,
  type MitamaSetRecipe,
} from "@/lib/mitama-branch-set-bonuses"
import { cn } from "@/lib/utils"

type BranchSetsContextValue = {
  open: boolean
  focusBranch: number | null
  toggle: () => void
  setOpen: (open: boolean) => void
  /** Open the panel and scroll to a branch (or just open if null). */
  showBranch: (branch?: number | null) => void
}

const BranchSetsContext = createContext<BranchSetsContextValue | null>(null)

export function useMitamaBranchSets(): BranchSetsContextValue {
  const ctx = useContext(BranchSetsContext)
  if (!ctx) {
    throw new Error(
      "useMitamaBranchSets must be used within MitamaBranchSetsProvider"
    )
  }
  return ctx
}

/** Optional hook when the provider may be absent. */
export function useMitamaBranchSetsOptional(): BranchSetsContextValue | null {
  return useContext(BranchSetsContext)
}

/**
 * Page shell: main content + optional sticky right sidebar that coexists
 * (no overlay / dialog).
 */
export function MitamaBranchSetsProvider({
  children,
}: {
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [focusBranch, setFocusBranch] = useState<number | null>(null)
  const titleId = useId()

  const toggle = useCallback(() => {
    setOpen((v) => !v)
  }, [])

  const showBranch = useCallback((branch?: number | null) => {
    if (branch != null) setFocusBranch(branch)
    setOpen(true)
  }, [])

  const value = useMemo(
    () => ({ open, focusBranch, toggle, setOpen, showBranch }),
    [open, focusBranch, toggle, showBranch]
  )

  useEffect(() => {
    if (!open || focusBranch == null) return
    const name = REUNION_BRANCH_NAMES[focusBranch]
    if (!name) return
    const el = document.getElementById(`mitama-branch-set-${name}`)
    el?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [open, focusBranch])

  return (
    <BranchSetsContext.Provider value={value}>
      <div
        className={cn(
          "mx-auto flex flex-col gap-4 px-4 py-8 lg:flex-row lg:items-start",
          open ? "max-w-7xl" : "max-w-5xl"
        )}
      >
        <div className="site-atmosphere min-w-0 flex-1">{children}</div>

        {open ? (
          <aside
            id="mitama-branch-sets-sidebar"
            aria-labelledby={titleId}
            className="site-atmosphere flex w-full shrink-0 flex-col border-2 border-border bg-card/80 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:w-[22rem] xl:w-[26rem]"
          >
            <header className="flex items-start justify-between gap-3 border-b border-border px-3 py-2.5">
              <div className="min-w-0">
                <h2
                  id={titleId}
                  className="font-heading text-sm font-semibold tracking-wide uppercase"
                >
                  Branch set bonuses
                </h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Mitama color recipes per branch.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => setOpen(false)}
                aria-pressed={open}
              >
                Hide
              </Button>
            </header>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
              <HowItWorks />

              <nav className="flex flex-wrap gap-1">
                {MITAMA_BRANCH_SET_BONUSES.map((branch, i) => (
                  <button
                    key={branch.name}
                    type="button"
                    className={cn(
                      "border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                      focusBranch === i && "border-gold-dim text-foreground"
                    )}
                    onClick={() => setFocusBranch(i)}
                  >
                    {branch.name}
                  </button>
                ))}
              </nav>

              <div className="space-y-4">
                {MITAMA_BRANCH_SET_BONUSES.map((branch) => (
                  <section
                    key={branch.name}
                    id={`mitama-branch-set-${branch.name}`}
                    className="scroll-mt-2 border border-border bg-muted/20 p-2.5"
                  >
                    <h3 className="text-xs font-semibold tracking-wide text-foreground uppercase">
                      {branch.name}
                    </h3>
                    <ul className="mt-2 space-y-1.5">
                      {branch.recipes.map((recipe, i) => (
                        <li key={i}>
                          <SetRecipeRow recipe={recipe} />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </BranchSetsContext.Provider>
  )
}

type SwitchControlProps = {
  /** When set, opens (or focuses) that branch instead of only toggling. */
  focusBranch?: number | null
  className?: string
  triggerLabel?: string
}

/** Switch control that shows/hides the coexisting mitama bonuses sidebar. */
export function MitamaBranchSetsSidebar({
  focusBranch = null,
  className,
  triggerLabel = "View mitama bonuses",
}: SwitchControlProps) {
  const ctx = useMitamaBranchSetsOptional()
  if (!ctx) return null

  const checked =
    focusBranch == null
      ? ctx.open
      : ctx.open && ctx.focusBranch === focusBranch

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-xs text-muted-foreground uppercase tracking-wide">
        {triggerLabel}
      </span>
      <Switch
        size="sm"
        checked={checked}
        aria-controls="mitama-branch-sets-sidebar"
        aria-label={triggerLabel}
        onCheckedChange={(next) => {
          if (focusBranch != null) {
            if (next) ctx.showBranch(focusBranch)
            else if (ctx.focusBranch === focusBranch) ctx.setOpen(false)
            return
          }
          ctx.setOpen(next)
        }}
      />
    </div>
  )
}

function SetRecipeRow({ recipe }: { recipe: MitamaSetRecipe }) {
  const counts = [
    [1, recipe.ara],
    [2, recipe.nigi],
    [3, recipe.kusi],
    [4, recipe.saki],
  ] as const

  return (
    <div className="flex flex-col gap-0.5 border border-border/70 bg-background/40 px-2 py-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {counts.map(([spirit, n]) => {
          const opt = getMitamaSpiritOption(spirit)
          return (
            <span
              key={spirit}
              className="inline-flex items-center gap-1 text-[11px] tabular-nums text-foreground"
              title={opt.name}
            >
              <span
                className="inline-block size-2.5 shrink-0 border border-border"
                style={{ backgroundColor: opt.color }}
                aria-hidden
              />
              {n}
            </span>
          )
        })}
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground sm:text-right">
        <span className="text-foreground">{recipe.effect}</span>
      </p>
    </div>
  )
}

function HowItWorks() {
  const colors = MITAMA_SPIRIT_OPTIONS.filter((o) => o.id > 0)

  return (
    <div className="space-y-2 border border-border bg-muted/30 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
      <p className="font-medium text-foreground">How to read these</p>
      <p>
        Each branch has{" "}
        <span className="text-foreground">8 Mitama slots</span>. Each row is a{" "}
        <span className="text-foreground">set bonus recipe</span>: meet the
        required color counts on that branch to turn the effect on.
      </p>
      <p className="flex flex-wrap items-center gap-2">
        Colors:
        {colors.map((c) => (
          <span
            key={c.id}
            className="inline-flex items-center gap-1 text-foreground"
          >
            <span
              className="inline-block size-2.5 border border-border"
              style={{ backgroundColor: c.color }}
            />
            {c.short}
          </span>
        ))}
      </p>
      <p>
        <span className="text-foreground">Example (Uruz):</span>{" "}
        <code className="text-[10px] text-foreground">2 red + 2 green</code> →
        Close-Range+30. With 8 slots you can unlock two different recipes (e.g.{" "}
        <code className="text-[10px] text-foreground">5 red + 3 green</code> →
        Close-Range+30 and Support+30).
      </p>
      <p>
        The same recipe does{" "}
        <span className="text-foreground">not stack twice</span>.{" "}
        <code className="text-[10px] text-foreground">4 red + 4 green</code> on
        Uruz still only gives Close-Range+30 once — not +60.
      </p>
    </div>
  )
}
