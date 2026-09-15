"use client"

import { useMemo, useState } from "react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { api } from "@/lib/kyClient"

type PreviewCharacter = {
  uuid: string
  name: string
  level: number
  gender: string
}

type PreviewData = {
  uploadToken: string
  characters: PreviewCharacter[]
  takenNames: string[]
  freeSlots: number
  occupiedSlots: number
  strip: {
    unknownItems: { type: number; count: number }[]
    unknownDemons: { type: number; count: number }[]
    skippedAccountDepotBoxes: number
  }
  notes: string[]
}

type RowState = {
  sourceName: string
  selected: boolean
  newName: string
}

export function CharacterImportPanel() {
  const [file, setFile] = useState<File | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [rows, setRows] = useState<RowState[]>([])
  const [open, setOpen] = useState(false)

  const takenSet = useMemo(
    () => new Set((preview?.takenNames ?? []).map((n) => n.toLowerCase())),
    [preview]
  )

  const selectedCount = rows.filter((r) => r.selected).length
  const freeSlots = preview?.freeSlots ?? 0

  async function onPreview(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setOk(null)
    if (!file) {
      setError("Choose a Backups XML file from the game client.")
      return
    }
    setPreviewBusy(true)
    try {
      const body = new FormData()
      body.append("backupXml", file)
      const response = await api("account/characters/import/preview", {
        method: "POST",
        body,
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: PreviewData
      }
      if (!response.ok || !json.success || !json.data) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      const data = json.data
      setPreview(data)
      setRows(
        data.characters.map((c) => ({
          sourceName: c.name,
          selected: true,
          newName: c.name,
        }))
      )
      setOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed")
    } finally {
      setPreviewBusy(false)
    }
  }

  async function onConfirm() {
    if (!preview) return
    setError(null)
    setConfirmBusy(true)
    try {
      const selections = rows
        .filter((r) => r.selected)
        .map((r) => ({
          sourceName: r.sourceName,
          newName: r.newName.trim(),
        }))
      if (!selections.length) {
        setError("Select at least one character.")
        return
      }
      if (selections.length > freeSlots) {
        setError(
          `Not enough free slots (need ${selections.length}, free ${freeSlots}).`
        )
        return
      }
      for (const sel of selections) {
        if (!sel.newName) {
          setError(`Enter a name for "${sel.sourceName}".`)
          return
        }
        if (takenSet.has(sel.newName.toLowerCase())) {
          setError(
            `"${sel.newName}" is already taken — choose a different name.`
          )
          return
        }
      }

      const response = await api("account/characters/import/confirm", {
        method: "POST",
        json: {
          uploadToken: preview.uploadToken,
          selections,
        },
        timeout: 120_000,
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: {
          imported: { sourceName: string; newName: string }[]
          strippedItems: number
          strippedDemons: number
        }
      }
      if (!response.ok || !json.success || !json.data) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      const names = json.data.imported.map((i) => i.newName).join(", ")
      const stripBits: string[] = []
      if (json.data.strippedItems) {
        stripBits.push(`${json.data.strippedItems} unknown item(s) removed`)
      }
      if (json.data.strippedDemons) {
        stripBits.push(`${json.data.strippedDemons} unknown demon(s) removed`)
      }
      setOk(
        `Imported ${json.data.imported.length} character(s): ${names}` +
          (stripBits.length ? ` (${stripBits.join("; ")})` : "")
      )
      setOpen(false)
      setPreview(null)
      setRows([])
      setFile(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed")
    } finally {
      setConfirmBusy(false)
    }
  }

  const unknownItemTotal =
    preview?.strip.unknownItems.reduce((n, x) => n + x.count, 0) ?? 0
  const unknownDemonTotal =
    preview?.strip.unknownDemons.reduce((n, x) => n + x.count, 0) ?? 0

  return (
    <>
      <section className="border border-border bg-card/60 px-4 py-4">
        <h2 className="font-heading text-sm tracking-[0.15em] text-gold uppercase">
          Import characters
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Upload an account XML from the game{" "}
          <code className="text-foreground">Backups</code> folder. You will pick
          which characters to add to this login. Log out of the client first.
        </p>
        <form className="mt-3 space-y-3" onSubmit={(e) => void onPreview(e)}>
          <Field>
            <FieldLabel htmlFor="char-import-file">Backups XML</FieldLabel>
            <input
              id="char-import-file"
              type="file"
              accept=".xml,application/xml,text/xml"
              className="block w-full text-sm text-muted-foreground file:mr-3 file:border file:border-border file:bg-muted file:px-2 file:py-1 file:text-xs file:font-semibold"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null)
                setOk(null)
                setError(null)
              }}
            />
          </Field>
          {error && !open ? <FormAlert variant="error">{error}</FormAlert> : null}
          {ok ? <FormAlert variant="success">{ok}</FormAlert> : null}
          <Button type="submit" size="sm" disabled={previewBusy || !file}>
            {previewBusy ? "Reading…" : "Review characters"}
          </Button>
        </form>
      </section>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (confirmBusy) return
          setOpen(next)
          if (!next) setError(null)
        }}
      >
        <DialogContent
          showCloseButton={!confirmBusy}
          className="sm:max-w-lg max-h-[min(90vh,40rem)] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>What characters do you want to import?</DialogTitle>
            <DialogDescription>
              {freeSlots} free slot{freeSlots === 1 ? "" : "s"} on this account
              ({preview?.occupiedSlots ?? 0} used). Names already on this server
              need a new name.
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-3">
            {rows.map((row, idx) => {
              const char = preview?.characters.find(
                (c) => c.name === row.sourceName
              )
              const needsRename = takenSet.has(row.newName.trim().toLowerCase())
              return (
                <li
                  key={row.sourceName}
                  className="border border-border bg-background/40 px-3 py-2"
                >
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={row.selected}
                      disabled={confirmBusy}
                      onChange={(e) => {
                        const selected = e.target.checked
                        setRows((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, selected } : r
                          )
                        )
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-foreground">
                        {row.sourceName}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Lv {char?.level ?? "?"} · {char?.gender ?? "?"}
                        {takenSet.has(row.sourceName.toLowerCase())
                          ? " · name taken"
                          : ""}
                      </span>
                      {row.selected ? (
                        <div className="mt-2">
                          <FieldLabel
                            htmlFor={`rename-${idx}`}
                            className="text-[11px]"
                          >
                            Import as
                          </FieldLabel>
                          <Input
                            id={`rename-${idx}`}
                            value={row.newName}
                            disabled={confirmBusy}
                            className="mt-1 h-8"
                            onChange={(e) => {
                              const newName = e.target.value
                              setRows((prev) =>
                                prev.map((r, i) =>
                                  i === idx ? { ...r, newName } : r
                                )
                              )
                            }}
                          />
                          {needsRename ? (
                            <p className="mt-1 text-[11px] text-[#ff9b9b]">
                              That name is taken — pick another.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>

          <div className="space-y-1 text-xs text-muted-foreground">
            {preview?.notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
            {unknownItemTotal > 0 || unknownDemonTotal > 0 ? (
              <p className="text-foreground">
                Will remove {unknownItemTotal} unknown item(s) and{" "}
                {unknownDemonTotal} unknown demon(s) from the selected
                characters.
              </p>
            ) : null}
            {(preview?.strip.skippedAccountDepotBoxes ?? 0) > 0 ? (
              <p>
                Skipping {preview?.strip.skippedAccountDepotBoxes} account{" "}
                <TooltipProvider delay={200}>
                  <Tooltip>
                    <TooltipTrigger className="cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-2">
                      depot/warehouse
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6} className="max-w-xs">
                      These shared storage boxes are in the backup, but character
                      import skips them on purpose so another account&apos;s
                      warehouse isn&apos;t merged onto your login. Only the
                      selected characters&apos; inventory/COMP are imported.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>{" "}
                box(es) in the file.
              </p>
            ) : null}
          </div>

          {error ? <FormAlert variant="error">{error}</FormAlert> : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={confirmBusy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={confirmBusy || selectedCount === 0}
              onClick={() => void onConfirm()}
            >
              {confirmBusy
                ? "Importing…"
                : `Import ${selectedCount}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
