"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Dices, Upload } from "lucide-react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { signOutAfterLobbyRestart } from "@/features/auth/lobby-restart"
import {
  fetchAdminCasino,
  fetchAdminCasinoAssets,
  restartLobbyForCasino,
  saveAdminCasinoGame,
  uploadAdminCasinoSwf,
  type CasinoFlashAsset,
} from "@/features/admin-casino/api"
import { notifyLaneAPendingChanged } from "@/features/admin/lane-a-pending"
import {
  KINO_PREDICTION_LABELS,
  type KinoSettings,
  type RouletteSettings,
  type SlotSettings,
  type WebGameId,
  type WebGameSettingsMap,
} from "@/lib/webgames-types"
import { cn } from "@/lib/utils"

const SLOT_PAYOUT_LABELS = [
  "Symbol 0",
  "Symbol 1",
  "Symbol 2",
  "Symbol 3",
  "Symbol 4",
  "Symbol 5",
  "Symbol 6",
  "Symbol 7",
  "Symbol 8",
]

const GAME_TABS: { id: WebGameId; label: string }[] = [
  { id: "slot", label: "Slots" },
  { id: "roulette", label: "Roulette" },
  { id: "kino", label: "Kino" },
]

type KinoTableTab = "costs" | "winnings" | "limits"

const KINO_TABS: { id: KinoTableTab; label: string }[] = [
  { id: "costs", label: "Costs" },
  { id: "winnings", label: "Winnings" },
  { id: "limits", label: "Limits" },
]

/** Same shell as admin/payouts CP ↔ Apples; active uses primary. */
function SegmentedTabs<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly { id: T; label: string }[]
  onChange: (next: T) => void
}) {
  return (
    <div
      className="inline-flex border-2 border-border"
      role="tablist"
      aria-label={label}
    >
      {options.map((opt, i) => {
        const selected = value === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold tracking-wide uppercase",
              i > 0 && "border-l-2 border-border",
              selected
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-muted-foreground hover:text-foreground"
            )}
            onClick={() => onChange(opt.id)}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function NumberField({
  id,
  label,
  hint,
  value,
  onChange,
  min = 0,
}: {
  id: string
  label: string
  hint?: string
  value: number
  onChange: (n: number) => void
  min?: number
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        min={min}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </Field>
  )
}

function IntArrayGrid({
  labels,
  values,
  onChange,
  columns = ["Value"],
}: {
  labels: readonly string[]
  values: number[]
  onChange: (next: number[]) => void
  columns?: string[]
}) {
  return (
    <div className="overflow-x-auto border border-border/80">
      <table className="w-full min-w-[28rem] text-left text-sm">
        <thead className="bg-muted/40 text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-2 py-1.5 font-medium">#</th>
            <th className="px-2 py-1.5 font-medium">Prediction</th>
            {columns.map((col) => (
              <th key={col} className="px-2 py-1.5 font-medium">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, i) => (
            <tr key={label} className="border-t border-border/60">
              <td className="px-2 py-1 font-mono text-xs text-muted-foreground">
                {i}
              </td>
              <td className="px-2 py-1">{label}</td>
              <td className="px-2 py-1">
                <Input
                  type="number"
                  min={0}
                  className="h-8"
                  value={values[i] ?? 0}
                  onChange={(e) => {
                    const next = [...values]
                    next[i] = Number(e.target.value)
                    onChange(next)
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function KinoTables({
  draft,
  setDraft,
}: {
  draft: KinoSettings
  setDraft: (next: KinoSettings) => void
}) {
  const [table, setTable] = useState<KinoTableTab>("costs")

  return (
    <div className="space-y-4">
      <NumberField
        id="kino-jackpot"
        label="Base jackpot"
        value={draft.baseJackpot}
        onChange={(baseJackpot) => setDraft({ ...draft, baseJackpot })}
        hint="Paid every 10 wins."
      />
      <SegmentedTabs
        label="Kino table"
        value={table}
        options={KINO_TABS}
        onChange={setTable}
      />
      {table === "costs" ? (
        <IntArrayGrid
          labels={KINO_PREDICTION_LABELS}
          values={draft.predictCosts}
          columns={["Coin cost"]}
          onChange={(predictCosts) => setDraft({ ...draft, predictCosts })}
        />
      ) : null}
      {table === "winnings" ? (
        <IntArrayGrid
          labels={KINO_PREDICTION_LABELS}
          values={draft.predictWinnings}
          columns={["Payout"]}
          onChange={(predictWinnings) =>
            setDraft({ ...draft, predictWinnings })
          }
        />
      ) : null}
      {table === "limits" ? (
        <IntArrayGrid
          labels={KINO_PREDICTION_LABELS}
          values={draft.predictLimits}
          columns={["Max bets / round"]}
          onChange={(predictLimits) => setDraft({ ...draft, predictLimits })}
        />
      ) : null}
    </div>
  )
}

function formatBytes(n: number | null): string {
  if (n == null || n <= 0) return "—"
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function CasinoFlashPanel({
  onMessage,
  onError,
}: {
  onMessage: (msg: string) => void
  onError: (msg: string) => void
}) {
  const queryClient = useQueryClient()
  const inputRefs = useRef<Partial<Record<WebGameId, HTMLInputElement | null>>>(
    {}
  )

  const assetsQuery = useQuery({
    queryKey: ["admin-casino-assets"],
    queryFn: fetchAdminCasinoAssets,
  })

  const uploadMutation = useMutation({
    mutationFn: ({ game, file }: { game: WebGameId; file: File }) =>
      uploadAdminCasinoSwf(game, file),
    onSuccess: async (data, vars) => {
      queryClient.setQueryData(["admin-casino-assets"], data)
      onMessage(
        `${vars.game === "slot" ? "Slots" : vars.game === "roulette" ? "Roulette" : "Kino"} game file is ready.`
      )
      onError("")
    },
    onError: (err: Error) => {
      onError(err.message || "Upload failed")
      onMessage("")
    },
  })

  const assets = assetsQuery.data?.assets ?? []
  const ready = assetsQuery.data?.ready ?? false

  function pickFile(game: WebGameId) {
    inputRefs.current[game]?.click()
  }

  function onFileChosen(game: WebGameId, fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file) return
    uploadMutation.mutate({ game, file })
  }

  return (
    <div className="space-y-3 border border-border/80 bg-muted/20 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Casino game files
        </p>
        {assetsQuery.isSuccess ? (
          <span
            className={cn(
              "rounded-sm border px-1.5 py-0.5 text-[0.65rem] font-medium uppercase",
              ready
                ? "border-emerald-500/50 bg-emerald-950/40 text-emerald-100"
                : "border-orange-500/50 bg-orange-950/40 text-orange-100"
            )}
          >
            {ready ? "Ready" : "Missing files"}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        The server needs these three Flash files to host casino for players.
        Upload <span className="font-mono">Slots.swf</span>,{" "}
        <span className="font-mono">Roulette.swf</span>, and{" "}
        <span className="font-mono">Kino.swf</span> once per install.
      </p>
      {assetsQuery.isError ? (
        <FormAlert variant="error">
          {assetsQuery.error instanceof Error
            ? assetsQuery.error.message
            : "Could not check game files"}
        </FormAlert>
      ) : null}
      <div className="space-y-2">
        {(assets.length
          ? assets
          : (["slot", "roulette", "kino"] as WebGameId[]).map((game) => ({
              game,
              label:
                game === "slot"
                  ? "Slots"
                  : game === "roulette"
                    ? "Roulette"
                    : "Kino",
              fileName:
                game === "slot"
                  ? "Slots.swf"
                  : game === "roulette"
                    ? "Roulette.swf"
                    : "Kino.swf",
              present: false,
              sizeBytes: null,
              path: "",
            }))
        ).map((asset: CasinoFlashAsset) => (
          <div
            key={asset.game}
            className="flex flex-wrap items-center justify-between gap-2 border border-border/60 bg-background/40 px-2 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{asset.label}</p>
              <p className="text-xs text-muted-foreground">
                {asset.present
                  ? `Installed · ${formatBytes(asset.sizeBytes)}`
                  : "Not uploaded yet"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={(el) => {
                  inputRefs.current[asset.game] = el
                }}
                type="file"
                accept=".swf,application/x-shockwave-flash"
                className="hidden"
                onChange={(e) => {
                  onFileChosen(asset.game, e.target.files)
                  e.target.value = ""
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={uploadMutation.isPending}
                onClick={() => pickFile(asset.game)}
              >
                <Upload className="size-3.5" aria-hidden />
                {asset.present ? "Replace" : "Upload"}
              </Button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Windows players also need{" "}
        <a
          href="https://gitlab.com/cleanflash/installer/-/releases"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Clean Flash Player
        </a>{" "}
        installed once on their PC.
      </p>
    </div>
  )
}

export function CasinoRngPanel() {
  const queryClient = useQueryClient()
  const [game, setGame] = useState<WebGameId>("slot")
  const [drafts, setDrafts] = useState<Partial<WebGameSettingsMap>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const listQuery = useQuery({
    queryKey: ["admin-casino"],
    queryFn: fetchAdminCasino,
  })

  useEffect(() => {
    if (!listQuery.data) return
    setDrafts((prev) => {
      const next = { ...prev }
      for (const file of listQuery.data.games) {
        if (!next[file.game]) {
          next[file.game] = file.settings as never
        }
      }
      return next
    })
  }, [listQuery.data])

  const currentSettings = useMemo(() => {
    const fromDraft = drafts[game]
    if (fromDraft) return fromDraft
    return listQuery.data?.games.find((g) => g.game === game)?.settings
  }, [drafts, game, listQuery.data])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentSettings) throw new Error("Nothing to save")
      return saveAdminCasinoGame(game, currentSettings as never)
    },
    onSuccess: async (file) => {
      setMessage(
        `Saved ${file.game === "slot" ? "Slots" : file.game === "roulette" ? "Roulette" : "Kino"}. Click “Apply to players” so the live casino reloads.`
      )
      setError(null)
      setDrafts((prev) => ({ ...prev, [file.game]: file.settings }))
      notifyLaneAPendingChanged()
      await queryClient.invalidateQueries({ queryKey: ["admin-casino"] })
    },
    onError: (err: Error) => {
      setError(err.message || "Save failed")
      setMessage(null)
    },
  })

  const restartMutation = useMutation({
    mutationFn: restartLobbyForCasino,
    onSuccess: async () => {
      setMessage("Applied — signing you out so login can reconnect.")
      setError(null)
      notifyLaneAPendingChanged()
      await queryClient.invalidateQueries({ queryKey: ["admin-casino"] })
      await signOutAfterLobbyRestart()
    },
    onError: (err: Error) => {
      setError(err.message || "Could not apply changes")
      setMessage(null)
    },
  })

  if (listQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  if (listQuery.isError) {
    return (
      <FormAlert variant="error">
        {listQuery.error instanceof Error
          ? listQuery.error.message
          : "Failed to load casino settings"}
      </FormAlert>
    )
  }

  const restartPending = listQuery.data?.restartPending ?? false

  return (
    <div className="space-y-4">
      <CasinoFlashPanel
        onMessage={(msg) => {
          if (msg) setMessage(msg)
        }}
        onError={(msg) => {
          if (msg) setError(msg)
          else setError(null)
        }}
      />

      {error ? <FormAlert variant="error">{error}</FormAlert> : null}
      {message ? <FormAlert variant="success">{message}</FormAlert> : null}
      {restartPending ? (
        <FormAlert variant="warning">
          Odds were saved but not live yet. Click “Apply to players” (this
          briefly restarts login — you will need to sign in again).
        </FormAlert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={saveMutation.isPending || !currentSettings}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? "Saving…" : "Save"}
        </Button>
        <TooltipProvider delay={200}>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  variant={restartPending ? "default" : "outline"}
                  disabled={restartMutation.isPending}
                  onClick={() => restartMutation.mutate()}
                />
              }
            >
              <Dices className="size-3.5" aria-hidden />
              {restartMutation.isPending ? "Applying…" : "Apply to players"}
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>
              Restarts lobby (login). You will need to sign in again.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <SegmentedTabs
        label="Casino game"
        value={game}
        options={GAME_TABS}
        onChange={(next) => {
          setGame(next)
          setMessage(null)
          setError(null)
        }}
      />

      {game === "slot" ? (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Cost per spin and how many coins each matching line pays.
          </p>
          {currentSettings ? (
            <FieldGroup>
              <NumberField
                id="slot-cost"
                label="Coin cost / spin"
                min={1}
                value={(currentSettings as SlotSettings).coinCost}
                onChange={(coinCost) =>
                  setDrafts((prev) => ({
                    ...prev,
                    slot: {
                      ...(prev.slot ?? (currentSettings as SlotSettings)),
                      coinCost,
                    },
                  }))
                }
              />
              <div className="space-y-2">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Line payouts by symbol
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(currentSettings as SlotSettings).reelItemPayout.map(
                    (value, i) => (
                      <NumberField
                        key={SLOT_PAYOUT_LABELS[i]}
                        id={`slot-payout-${i}`}
                        label={SLOT_PAYOUT_LABELS[i]!}
                        value={value}
                        onChange={(n) => {
                          const reelItemPayout = [
                            ...(currentSettings as SlotSettings).reelItemPayout,
                          ]
                          reelItemPayout[i] = n
                          setDrafts((prev) => ({
                            ...prev,
                            slot: {
                              ...(prev.slot ??
                                (currentSettings as SlotSettings)),
                              reelItemPayout,
                            },
                          }))
                        }}
                      />
                    )
                  )}
                </div>
              </div>
            </FieldGroup>
          ) : null}
        </div>
      ) : null}

      {game === "roulette" ? (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Bet cost, double-up limit, and jackpot size knobs for inside hits.
          </p>
          {currentSettings ? (
            <FieldGroup className="grid gap-3 sm:grid-cols-2">
              <NumberField
                id="roulette-cost"
                label="Base coin cost"
                min={1}
                value={(currentSettings as RouletteSettings).coinCost}
                onChange={(coinCost) =>
                  setDrafts((prev) => ({
                    ...prev,
                    roulette: {
                      ...(prev.roulette ??
                        (currentSettings as RouletteSettings)),
                      coinCost,
                    },
                  }))
                }
              />
              <NumberField
                id="roulette-double"
                label="Max double-up"
                value={(currentSettings as RouletteSettings).maxDoubleUp}
                onChange={(maxDoubleUp) =>
                  setDrafts((prev) => ({
                    ...prev,
                    roulette: {
                      ...(prev.roulette ??
                        (currentSettings as RouletteSettings)),
                      maxDoubleUp,
                    },
                  }))
                }
              />
              <NumberField
                id="roulette-base-jp"
                label="Base jackpot"
                value={(currentSettings as RouletteSettings).baseJackpot}
                onChange={(baseJackpot) =>
                  setDrafts((prev) => ({
                    ...prev,
                    roulette: {
                      ...(prev.roulette ??
                        (currentSettings as RouletteSettings)),
                      baseJackpot,
                    },
                  }))
                }
              />
              <NumberField
                id="roulette-mod"
                label="Jackpot modulus"
                min={1}
                value={(currentSettings as RouletteSettings).jackpotMod}
                onChange={(jackpotMod) =>
                  setDrafts((prev) => ({
                    ...prev,
                    roulette: {
                      ...(prev.roulette ??
                        (currentSettings as RouletteSettings)),
                      jackpotMod,
                    },
                  }))
                }
              />
              <NumberField
                id="roulette-mult"
                label="Jackpot multiplier"
                min={1}
                value={(currentSettings as RouletteSettings).jackpotMult}
                onChange={(jackpotMult) =>
                  setDrafts((prev) => ({
                    ...prev,
                    roulette: {
                      ...(prev.roulette ??
                        (currentSettings as RouletteSettings)),
                      jackpotMult,
                    },
                  }))
                }
              />
            </FieldGroup>
          ) : null}
        </div>
      ) : null}

      {game === "kino" ? (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Prediction costs, payouts, and how many times each bet can be placed
            per round.
          </p>
          {currentSettings ? (
            <KinoTables
              draft={currentSettings as KinoSettings}
              setDraft={(kino) => setDrafts((prev) => ({ ...prev, kino }))}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
