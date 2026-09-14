"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CircleHelp, Trash2 } from "lucide-react"

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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  OpsIngestStatus,
} from "@/features/admin/components/OpsIngestStatus"
import type { IngestJobView } from "@/features/admin/ops-ingest-client"
import { api } from "@/lib/kyClient"

type BackupArchive = {
  name: string
  sizeBytes: number
  mtime: string
  sha256Present?: boolean
  mode?: string | null
  sqlite?: string | null
  websiteSqlite?: string | null
}

type BackupSchedule = {
  enabled?: boolean
  mode?: string
  intervalHours?: number
  remote?: string
  path?: string
  keepLocal?: number
  keepRemote?: number
  lastRunAt?: string | null
  lastSyncAt?: string | null
  lastError?: string | null
  rcloneConfigured?: boolean
  rcloneRemotes?: string[]
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MiB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GiB`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function pollJob(
  jobId: string,
  onJob: (job: IngestJobView) => void
): Promise<{ ok: boolean; message: string }> {
  for (let i = 0; i < 36_000; i += 1) {
    await sleep(500)
    const response = await api.get("admin/ops/backup/job", {
      searchParams: { id: jobId },
    })
    const json = (await response.json()) as {
      success?: boolean
      message?: string
      data?: IngestJobView & {
        result?: { ok?: boolean; message?: string; detail?: string; error?: string }
      }
    }
    if (!json.success || !json.data) {
      return { ok: false, message: json.message || "Job lost" }
    }
    onJob(json.data)
    if (
      json.data.finished ||
      json.data.phase === "done" ||
      json.data.phase === "error"
    ) {
      const failed =
        json.data.phase === "error" || json.data.result?.ok === false
      return {
        ok: !failed,
        message:
          json.data.result?.message ||
          json.data.result?.detail ||
          json.data.error ||
          (failed ? "Failed" : "Done"),
      }
    }
  }
  return { ok: false, message: "Timed out waiting for job" }
}

export function AdminOpsBackup() {
  const [archives, setArchives] = useState<BackupArchive[]>([])
  const [schedule, setSchedule] = useState<BackupSchedule>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [job, setJob] = useState<IngestJobView | null>(null)
  const [uploadPct, setUploadPct] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)

  const [enabled, setEnabled] = useState(false)
  const [mode, setMode] = useState<"standard" | "full">("standard")
  const [intervalHours, setIntervalHours] = useState(24)
  const [remote, setRemote] = useState("")
  const [remotePath, setRemotePath] = useState("smt-backups")
  const [keepLocal, setKeepLocal] = useState(7)
  const [keepRemote, setKeepRemote] = useState(14)
  const [rcloneConfig, setRcloneConfig] = useState("")

  const [restoreName, setRestoreName] = useState<string | null>(null)
  const [restoreEnv, setRestoreEnv] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [deleteName, setDeleteName] = useState<string | null>(null)
  const [rcloneHelpOpen, setRcloneHelpOpen] = useState(false)
  const [rcloneError, setRcloneError] = useState<string | null>(null)
  const [rcloneInfo, setRcloneInfo] = useState<string | null>(null)
  const [syncJobActive, setSyncJobActive] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const response = await api.get("admin/ops/backup")
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: {
          archives?: BackupArchive[]
          schedule?: BackupSchedule
        }
      }
      if (!response.ok || !json.success || !json.data) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setArchives(json.data.archives || [])
      const s = json.data.schedule || {}
      setSchedule(s)
      setEnabled(Boolean(s.enabled))
      setMode(s.mode === "full" ? "full" : "standard")
      setIntervalHours(Number(s.intervalHours) || 24)
      setRemote(s.remote || "")
      setRemotePath(s.path || "smt-backups")
      setKeepLocal(Number(s.keepLocal) || 7)
      setKeepRemote(Number(s.keepRemote) || 14)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load backups")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const runBackup = async (backupMode: "standard" | "full") => {
    setBusy(true)
    setError(null)
    setInfo(null)
    setJob(null)
    try {
      const response = await api.post("admin/ops/backup/run", {
        json: { mode: backupMode },
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { jobId?: string }
      }
      if (!response.ok || !json.success || !json.data?.jobId) {
        setError(json.message || "Backup failed to start")
        return
      }
      const result = await pollJob(json.data.jobId, setJob)
      if (result.ok) {
        setInfo(result.message)
        await refresh()
      } else {
        setError(result.message)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backup failed")
    } finally {
      setBusy(false)
    }
  }

  const downloadArchive = async (name: string) => {
    setError(null)
    try {
      const response = await fetch(
        `/api/admin/ops/backup/${encodeURIComponent(name)}/download`,
        {
          credentials: "include",
          headers: { "X-Requested-With": "XMLHttpRequest" },
        }
      )
      if (!response.ok) {
        setError(`Download failed (HTTP ${response.status})`)
        return
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed")
    }
  }

  const importArchive = async (file: File) => {
    if (!/^smt-runtime-\d{8}-\d{6}\.tar\.gz$/.test(file.name)) {
      setError("File must be named smt-runtime-YYYYMMDD-HHMMSS.tar.gz")
      return
    }
    setUploading(true)
    setUploadPct(0)
    setError(null)
    setInfo(null)
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open(
          "POST",
          `/api/admin/ops/backup/import?name=${encodeURIComponent(file.name)}`
        )
        xhr.withCredentials = true
        xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest")
        xhr.setRequestHeader("Content-Type", "application/gzip")
        xhr.upload.onprogress = (ev) => {
          if (!ev.lengthComputable || ev.total <= 0) return
          setUploadPct(Math.min(100, Math.round((100 * ev.loaded) / ev.total)))
        }
        xhr.onload = () => {
          try {
            const parsed = JSON.parse(xhr.responseText) as {
              success?: boolean
              message?: string
            }
            if (xhr.status >= 400 || parsed.success === false) {
              reject(new Error(parsed.message || `HTTP ${xhr.status}`))
              return
            }
            resolve()
          } catch {
            reject(new Error(`HTTP ${xhr.status}`))
          }
        }
        xhr.onerror = () => reject(new Error("Upload failed"))
        xhr.send(file)
      })
      setInfo(`Imported ${file.name}`)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed")
    } finally {
      setUploading(false)
      setUploadPct(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteName) return
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      const response = await api.post("admin/ops/backup/delete", {
        json: { confirm: true, name: deleteName },
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
      }
      setDeleteName(null)
      if (!response.ok || !json.success) {
        setError(json.message || "Delete failed")
        return
      }
      setInfo(json.message || "Deleted")
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed")
    } finally {
      setBusy(false)
    }
  }

  const confirmRestore = async () => {
    if (!restoreName || confirmText !== "RESTORE") return
    setBusy(true)
    setError(null)
    setInfo(null)
    setJob(null)
    try {
      const response = await api.post("admin/ops/backup/restore", {
        json: {
          confirm: true,
          name: restoreName,
          restoreEnv,
        },
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { jobId?: string }
      }
      setRestoreName(null)
      setConfirmText("")
      if (!response.ok || !json.success || !json.data?.jobId) {
        setError(json.message || "Restore failed to start")
        return
      }
      const result = await pollJob(json.data.jobId, setJob)
      if (result.ok) {
        setInfo(result.message)
        await refresh()
      } else {
        setError(result.message)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed")
    } finally {
      setBusy(false)
    }
  }

  const saveRemote = async () => {
    setBusy(true)
    setRcloneError(null)
    setRcloneInfo(null)
    try {
      let remoteName = remote.trim().replace(/:$/, "")
      if (!remoteName && rcloneConfig.trim()) {
        const match = rcloneConfig.match(/^\s*\[([^\]]+)\]/m)
        if (match?.[1]) remoteName = match[1].trim()
      }
      const body: Record<string, unknown> = {
        enabled,
        mode,
        intervalHours,
        remote: remoteName,
        path: remotePath,
        keepLocal,
        keepRemote,
      }
      if (rcloneConfig.trim()) {
        body.rcloneConfig = rcloneConfig
      }
      const response = await api.put("admin/ops/backup/remote", {
        json: body,
        timeout: 60_000,
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { schedule?: BackupSchedule; message?: string }
      }
      if (!response.ok || !json.success) {
        setRcloneError(json.message || "Save failed")
        return
      }
      if (remoteName && !remote.trim()) setRemote(remoteName)
      setRcloneInfo(json.data?.message || json.message || "Saved")
      setRcloneConfig("")
      await refresh()
    } catch (e) {
      setRcloneError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  const testRemote = async () => {
    setBusy(true)
    setRcloneError(null)
    setRcloneInfo(null)
    try {
      let remoteName = remote.trim().replace(/:$/, "")
      if (!remoteName && rcloneConfig.trim()) {
        const match = rcloneConfig.match(/^\s*\[([^\]]+)\]/m)
        if (match?.[1]) remoteName = match[1].trim()
      }
      if (!remoteName && schedule.rcloneConfigured) {
        // leave empty — ops will infer from saved conf if only one remote
      } else if (!remoteName) {
        setRcloneError(
          "Set rclone remote name (from `rclone listremotes`, without the :), or paste rclone.conf first"
        )
        return
      }
      const response = await api.post("admin/ops/backup/remote", {
        json: {
          enabled,
          mode,
          intervalHours,
          remote: remoteName,
          path: remotePath,
          keepLocal,
          keepRemote,
          ...(rcloneConfig.trim() ? { rcloneConfig } : {}),
        },
        // rclone Drive/S3 probe can take > ky's default 10s
        timeout: 180_000,
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
      }
      if (!response.ok || !json.success) {
        setRcloneError(json.message || "rclone test failed")
        return
      }
      if (remoteName) setRemote(remoteName)
      setRcloneInfo(json.message || "Remote OK")
      await refresh()
    } catch (e) {
      setRcloneError(e instanceof Error ? e.message : "rclone test failed")
    } finally {
      setBusy(false)
    }
  }

  const syncNow = async (archiveName?: string) => {
    setBusy(true)
    setSyncJobActive(true)
    setRcloneError(null)
    setRcloneInfo(null)
    setJob(null)
    try {
      const response = await api.post("admin/ops/backup/sync", {
        json: archiveName ? { name: archiveName } : {},
        timeout: 180_000,
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { jobId?: string }
      }
      if (!response.ok || !json.success || !json.data?.jobId) {
        setRcloneError(json.message || "Sync failed to start")
        return
      }
      const result = await pollJob(json.data.jobId, setJob)
      if (result.ok) {
        setRcloneInfo(result.message)
        await refresh()
      } else {
        setRcloneError(result.message)
      }
    } catch (e) {
      setRcloneError(e instanceof Error ? e.message : "Sync failed")
    } finally {
      setBusy(false)
      setSyncJobActive(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading backups…</p>
  }

  return (
    <div className="space-y-8">
      {error ? <FormAlert variant="error">{error}</FormAlert> : null}
      {info ? <FormAlert variant="success">{info}</FormAlert> : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={busy || uploading}
            onClick={() => void runBackup("standard")}
          >
            Backup now (standard)
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || uploading}
            onClick={() => void runBackup("full")}
          >
            Backup now (full)
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || uploading}
            onClick={() => fileRef.current?.click()}
          >
            Import archive…
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".tar.gz,application/gzip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ""
              if (f) void importArchive(f)
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Standard: config + game SQLite/MariaDB + website-data + .env (brief
          downtime). Full also includes datastore/BinaryData/webroot. Archives
          contain secrets — treat off-box copies carefully.
        </p>
        <OpsIngestStatus
          uploadPct={uploadPct}
          uploading={uploading}
          job={job}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Local archives</h2>
        {archives.length === 0 ? (
          <p className="text-sm text-muted-foreground">No archives yet.</p>
        ) : (
          <div className="overflow-x-auto border border-border">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Archive</th>
                  <th className="px-3 py-2 font-medium">Size</th>
                  <th className="px-3 py-2 font-medium">Mode</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {archives.map((a) => (
                  <tr key={a.name} className="border-b border-border/60">
                    <td className="px-3 py-2 font-mono text-xs">
                      <div>{a.name}</div>
                      <div className="text-muted-foreground">{a.mtime}</div>
                    </td>
                    <td className="px-3 py-2">{formatBytes(a.sizeBytes)}</td>
                    <td className="px-3 py-2">
                      {a.mode || "—"}
                      {a.websiteSqlite === "yes" ? " + web" : ""}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void downloadArchive(a.name)}
                        >
                          Download
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={busy}
                          onClick={() => {
                            setRestoreName(a.name)
                            setConfirmText("")
                            setRestoreEnv(false)
                          }}
                        >
                          Restore
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="outline"
                          disabled={busy}
                          aria-label={`Delete ${a.name}`}
                          title="Delete local archive"
                          onClick={() => setDeleteName(a.name)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">Off-box sync (rclone)</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            aria-label="Help: rclone setup"
            onClick={() => setRcloneHelpOpen(true)}
          >
            <CircleHelp className="size-4 text-muted-foreground" />
          </Button>
        </div>
        {rcloneError ? (
          <FormAlert variant="error">{rcloneError}</FormAlert>
        ) : null}
        {rcloneInfo ? (
          <FormAlert variant="success">{rcloneInfo}</FormAlert>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Create an rclone remote on any machine (
          <code className="text-[11px]">rclone config</code>
          ), then paste the config here. Ops stores it under the backups volume
          (not in the website DB). Scheduled backups run inside ops — no host
          crontab required.
        </p>
        <FieldGroup>
          <Field>
            <FieldLabel>
              <input
                type="checkbox"
                className="mr-2"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Enable scheduled backups
            </FieldLabel>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="backup-mode">Default mode</FieldLabel>
              <select
                id="backup-mode"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={mode}
                onChange={(e) =>
                  setMode(e.target.value === "full" ? "full" : "standard")
                }
              >
                <option value="standard">standard</option>
                <option value="full">full</option>
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="backup-interval">Interval (hours)</FieldLabel>
              <Input
                id="backup-interval"
                type="number"
                min={1}
                value={intervalHours}
                onChange={(e) => setIntervalHours(Number(e.target.value) || 24)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="backup-remote">rclone remote name</FieldLabel>
              <Input
                id="backup-remote"
                value={remote}
                placeholder="gdrive"
                onChange={(e) => setRemote(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                From <code className="text-[10px]">rclone listremotes</code>{" "}
                without the trailing colon
                {schedule.rcloneRemotes && schedule.rcloneRemotes.length > 0
                  ? ` — found in config: ${schedule.rcloneRemotes.join(", ")}`
                  : ""}
                . Leave blank if your pasted config has only one remote; we
                auto-fill it on Save.
              </p>
            </Field>
            <Field>
              <FieldLabel htmlFor="backup-path">Remote path</FieldLabel>
              <Input
                id="backup-path"
                value={remotePath}
                onChange={(e) => setRemotePath(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="backup-keep-local">Keep local</FieldLabel>
              <Input
                id="backup-keep-local"
                type="number"
                min={0}
                value={keepLocal}
                onChange={(e) => setKeepLocal(Number(e.target.value) || 0)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="backup-keep-remote">Keep remote</FieldLabel>
              <Input
                id="backup-keep-remote"
                type="number"
                min={0}
                value={keepRemote}
                onChange={(e) => setKeepRemote(Number(e.target.value) || 0)}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="backup-rclone">
              rclone.conf paste
              {schedule.rcloneConfigured
                ? " (configured — paste to replace)"
                : " (required for sync)"}
            </FieldLabel>
            <Textarea
              id="backup-rclone"
              rows={6}
              className="font-mono text-xs"
              placeholder={"[gdrive]\ntype = drive\n…"}
              value={rcloneConfig}
              onChange={(e) => {
                const text = e.target.value
                setRcloneConfig(text)
                if (!remote.trim()) {
                  const match = text.match(/^\s*\[([^\]]+)\]/m)
                  if (match?.[1]) setRemote(match[1].trim())
                }
              }}
            />
          </Field>
        </FieldGroup>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy} onClick={() => void saveRemote()}>
            Save settings
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void testRemote()}
          >
            Test remote
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || archives.length === 0 || !schedule.rcloneConfigured}
            title={
              !schedule.rcloneConfigured
                ? "Paste rclone.conf and Save first"
                : archives.length === 0
                  ? "Backup now first"
                  : "Upload newest local archive to rclone"
            }
            onClick={() => void syncNow()}
          >
            Sync now
          </Button>
        </div>
        <OpsIngestStatus
          uploadPct={null}
          uploading={false}
          job={syncJobActive ? job : null}
        />
        <p className="text-xs text-muted-foreground">
          Last run: {schedule.lastRunAt || "—"} · Last sync:{" "}
          {schedule.lastSyncAt || "—"}
          {schedule.lastError ? (
            <>
              {" "}
              · Error: <span className="text-destructive">{schedule.lastError}</span>
            </>
          ) : null}
        </p>
      </section>

      <Dialog
        open={rcloneHelpOpen}
        onOpenChange={setRcloneHelpOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How to get rclone.conf</DialogTitle>
            <DialogDescription>
              After you finish <code className="text-xs">rclone config</code>{" "}
              on any machine, paste that file here so backups can sync off-box
              (Google Drive, B2, S3, …).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <ol className="list-decimal space-y-3 pl-4">
              <li>
                <p className="text-foreground">List your remote name</p>
                <pre className="mt-1 overflow-x-auto border border-border bg-muted/30 p-2 font-mono text-[11px] text-foreground">
                  rclone listremotes
                </pre>
                <p className="mt-1 text-xs">
                  You should see something like{" "}
                  <code className="text-[11px]">gdrive:</code>. Use the name{" "}
                  <strong>without</strong> the trailing colon in{" "}
                  <span className="text-foreground">rclone remote name</span>{" "}
                  (e.g. <code className="text-[11px]">gdrive</code>).
                </p>
              </li>
              <li>
                <p className="text-foreground">Show the config file</p>
                <pre className="mt-1 overflow-x-auto border border-border bg-muted/30 p-2 font-mono text-[11px] text-foreground">
                  {`cat ~/.config/rclone/rclone.conf`}
                </pre>
                <p className="mt-1 text-xs">
                  On Windows that path is usually{" "}
                  <code className="text-[11px]">
                    %APPDATA%\rclone\rclone.conf
                  </code>
                  . Or run{" "}
                  <code className="text-[11px]">rclone config file</code> to
                  print the exact location.
                </p>
              </li>
              <li>
                <p className="text-foreground">Paste into this page</p>
                <p className="mt-1 text-xs">
                  Copy the full file into{" "}
                  <span className="text-foreground">rclone.conf paste</span>,
                  set <span className="text-foreground">Remote path</span>{" "}
                  (e.g. <code className="text-[11px]">smt-backups</code>), then{" "}
                  <span className="text-foreground">Save settings</span> and{" "}
                  <span className="text-foreground">Test remote</span>.
                </p>
              </li>
            </ol>
            <p className="text-xs">
              After that, each successful Backup now (or a scheduled run) copies
              the new archive to{" "}
              <code className="text-[11px]">remote:path/</code>. You only need
              to paste the config once (or again if you re-auth).
            </p>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setRcloneHelpOpen(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteName)}
        onOpenChange={(open) => {
          if (!open) setDeleteName(null)
        }}
      >
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>Delete local archive?</DialogTitle>
            <DialogDescription>
              Removes{" "}
              <span className="font-mono text-xs">{deleteName}</span> from
              this host only. Off-box rclone copies are not deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setDeleteName(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void confirmDelete()}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(restoreName)}
        onOpenChange={(open) => {
          if (!open) {
            setRestoreName(null)
            setConfirmText("")
          }
        }}
      >
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>Restore archive?</DialogTitle>
            <DialogDescription>
              This stops the stack and replaces live <code>data/</code> and
              website-data from{" "}
              <span className="font-mono text-xs">{restoreName}</span>. Type{" "}
              <strong>RESTORE</strong> to confirm.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="restore-confirm">Confirmation</FieldLabel>
              <Input
                id="restore-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="RESTORE"
                autoComplete="off"
              />
            </Field>
            <Field>
              <FieldLabel>
                <input
                  type="checkbox"
                  className="mr-2"
                  checked={restoreEnv}
                  onChange={(e) => setRestoreEnv(e.target.checked)}
                />
                Also restore compose .env from the archive
              </FieldLabel>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setRestoreName(null)
                setConfirmText("")
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || confirmText !== "RESTORE"}
              onClick={() => void confirmRestore()}
            >
              Restore now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
