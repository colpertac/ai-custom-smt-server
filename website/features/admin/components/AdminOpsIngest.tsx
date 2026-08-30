"use client"

import { useCallback, useEffect, useState } from "react"
import { CircleHelp } from "lucide-react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { OpsIngestStatus } from "@/features/admin/components/OpsIngestStatus"
import {
  runIngestZip,
  type IngestJobView,
} from "@/features/admin/ops-ingest-client"
import { api } from "@/lib/kyClient"

const KINDS = [
  {
    id: "release",
    label: "Release (client + server) — usual",
    hint: "Zip with client/ → updater/overlay + rehash; server/ → datastore (restart channel)",
  },
  {
    id: "content",
    label: "Content (multi, no client/ prefix)",
    hint: "Top-level BinaryData/, Map/, packages/, overlay/ (server trees + optional overlay/)",
  },
  {
    id: "binarydata",
    label: "Server BinaryData only",
    hint: "→ datastore/BinaryData/ (channel; no ImagineUpdate)",
  },
  {
    id: "maps",
    label: "Server maps only",
    hint: "→ datastore/Map/ (channel; no ImagineUpdate)",
  },
  {
    id: "packages",
    label: "Packages only",
    hint: "→ datastore/packages/ (*.zip members; merge-only)",
  },
  {
    id: "overlay",
    label: "Client overlay only",
    hint: "→ updater/overlay/ + rehash (translations / client files; no channel restart)",
  },
] as const

type KindId = (typeof KINDS)[number]["id"]
type ModeId = "merge" | "replace"

export function AdminOpsIngest() {
  const [kind, setKind] = useState<KindId>("release")
  const [mode, setMode] = useState<ModeId>("merge")
  const [file, setFile] = useState<File | null>(null)
  const [pending, setPending] = useState(false)
  const [rehashing, setRehashing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [uploadPct, setUploadPct] = useState<number | null>(null)
  const [job, setJob] = useState<IngestJobView | null>(null)
  const [overlayStale, setOverlayStale] = useState(false)

  const refreshStale = useCallback(async () => {
    try {
      const response = await api("admin/ops/health")
      const json = (await response.json()) as {
        success?: boolean
        data?: { overlayStale?: boolean }
      }
      if (response.ok && json.success) {
        setOverlayStale(Boolean(json.data?.overlayStale))
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void refreshStale()
  }, [refreshStale])

  useEffect(() => {
    const onFreshness = () => {
      void refreshStale()
    }
    window.addEventListener("ops-freshness-changed", onFreshness)
    return () => {
      window.removeEventListener("ops-freshness-changed", onFreshness)
    }
  }, [refreshStale])

  const busy = pending || rehashing

  const onSubmit = useCallback(async () => {
    if (!file) {
      setError("Choose a .zip file first")
      return
    }
    setPending(true)
    setError(null)
    setOk(null)
    setJob(null)
    setUploadPct(0)
    try {
      const result = await runIngestZip({
        kind,
        mode,
        file,
        onUploadProgress: setUploadPct,
        onJob: setJob,
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setOk(result.message)
      setFile(null)
      window.dispatchEvent(new Event("ops-freshness-changed"))
    } catch (e) {
      setError(e instanceof Error ? e.message : "ingest failed")
    } finally {
      setPending(false)
      setUploadPct(null)
    }
  }, [file, kind, mode])

  const rehash = useCallback(async () => {
    setRehashing(true)
    setError(null)
    setOk(null)
    try {
      const response = await api.post("admin/ops/publish/lane-b")
      const json = (await response.json()) as {
        success?: boolean
        message?: string
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setOk(json.message || "Overlay rehashed")
      window.dispatchEvent(new Event("ops-freshness-changed"))
    } catch (e) {
      setError(e instanceof Error ? e.message : "rehash failed")
    } finally {
      setRehashing(false)
    }
  }, [])

  const kindMeta = KINDS.find((k) => k.id === kind)

  return (
    <section className="mt-12">
      <div className="flex items-center gap-2">
        <h2 className="font-heading text-xl font-semibold tracking-[0.08em] uppercase">
          Content zip
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="What do the zip kinds mean?"
          onClick={() => setHelpOpen(true)}
        >
          <CircleHelp className="size-4 text-muted-foreground" />
        </Button>
      </div>
      <div className="gold-rule mt-2 max-w-[12rem]" />
      <p className="mt-3 max-w-xl text-sm text-muted-foreground">
        One upload path for server datastore and/or client updater files. For a
        new item/demon, prefer{" "}
        <span className="text-foreground">Release</span> with{" "}
        <code className="text-foreground">client/</code> and{" "}
        <code className="text-foreground">server/</code>. Overlay files land in{" "}
        <code className="text-foreground">updater/overlay/</code> (what
        ImagineUpdate downloads) and rehash automatically; datastore trees need
        a <span className="text-foreground">channel restart</span>.
      </p>
      {error ? (
        <FormAlert className="mt-4" variant="error">
          {error}
        </FormAlert>
      ) : null}
      {ok ? (
        <FormAlert className="mt-4" variant="success">
          {ok}
        </FormAlert>
      ) : null}
      {overlayStale && !ok ? (
        <FormAlert className="mt-4" variant="warning">
          Overlay files changed without a successful rehash. Run{" "}
          <span className="text-foreground">Rehash overlay</span> so clients can
          update.
        </FormAlert>
      ) : null}
      <OpsIngestStatus uploadPct={uploadPct} uploading={pending} job={job} />
      <div className="mt-4 flex max-w-xl flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Kind</span>
          <select
            className="border border-border bg-muted/40 px-2 py-1.5 text-sm text-foreground"
            value={kind}
            disabled={busy}
            onChange={(e) => {
              const next = e.target.value as KindId
              setKind(next)
              if (next === "packages") setMode("merge")
            }}
          >
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
          {kindMeta ? (
            <span className="text-xs text-muted-foreground">{kindMeta.hint}</span>
          ) : null}
        </label>
        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="text-muted-foreground">Mode</legend>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="ingest-mode"
              checked={mode === "merge"}
              disabled={busy}
              onChange={() => setMode("merge")}
              className="mt-1"
            />
            <span>
              <span className="text-foreground">Merge</span>
              <span className="block text-xs text-muted-foreground">
                Update/add files from the zip. Existing files not in the zip stay.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="ingest-mode"
              checked={mode === "replace"}
              disabled={busy || kind === "packages"}
              onChange={() => setMode("replace")}
              className="mt-1"
            />
            <span>
              <span className="text-foreground">Replace</span>
              <span className="block text-xs text-muted-foreground">
                Destination becomes an exact mirror of the zip for Maps /
                BinaryData / overlay. Files missing from the zip are deleted.
                {kind === "packages"
                  ? " (Unavailable for Packages.)"
                  : ""}
              </span>
            </span>
          </label>
        </fieldset>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Zip file</span>
          <input
            type="file"
            accept=".zip,application/zip"
            disabled={busy}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm file:mr-2 file:border file:border-border file:bg-muted/40 file:px-2 file:py-1"
          />
          {file ? (
            <span className="text-xs text-muted-foreground">
              {file.name} ({Math.round(file.size / 1024)} KiB)
            </span>
          ) : null}
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "replace" ? "destructive" : "default"}
            disabled={busy || !file}
            onClick={() => void onSubmit()}
          >
            {pending
              ? "Uploading…"
              : mode === "replace"
                ? "Upload & replace"
                : kind === "overlay" || kind === "release"
                  ? "Upload & rehash"
                  : "Upload & merge"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void rehash()}
          >
            {rehashing ? "Rehashing…" : "Rehash overlay"}
          </Button>
        </div>
      </div>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Content zip kinds</DialogTitle>
            <DialogDescription>
              Datastore paths feed the channel.{" "}
              <code className="text-foreground">updater/overlay/</code> is what
              ImagineUpdate serves to players — same BinaryData tree, different
              consumer.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[min(70vh,28rem)] space-y-4 overflow-y-auto text-xs/relaxed">
            <p className="text-muted-foreground">
              New item/demon art: use{" "}
              <span className="font-medium text-foreground">Release</span> so{" "}
              <code className="text-foreground">server/</code> updates the
              channel and <code className="text-foreground">client/</code>{" "}
              updates the updater. Rare one-sided cases: packages/shops (server
              only) or EN translation overlay (client only).
            </p>
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">Kind</th>
                  <th className="py-1.5 font-medium">Where it goes</th>
                </tr>
              </thead>
              <tbody className="text-foreground">
                <tr className="border-b border-border/60 align-top">
                  <td className="py-2 pr-2">Release</td>
                  <td className="py-2">
                    <code>client/</code> → overlay + rehash;{" "}
                    <code>server/…</code> → datastore
                  </td>
                </tr>
                <tr className="border-b border-border/60 align-top">
                  <td className="py-2 pr-2">BinaryData / Maps / Packages</td>
                  <td className="py-2">
                    Server only under <code>datastore/</code> (restart channel)
                  </td>
                </tr>
                <tr className="border-b border-border/60 align-top">
                  <td className="py-2 pr-2">Overlay</td>
                  <td className="py-2">
                    <code>updater/overlay/</code> + rehash (players run updater)
                  </td>
                </tr>
                <tr className="align-top">
                  <td className="py-2 pr-2">Content</td>
                  <td className="py-2">
                    Top-level <code>BinaryData/</code>, <code>Map/</code>,{" "}
                    <code>packages/</code>, <code>overlay/</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
