"use client"

import { useCallback, useEffect, useState } from "react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { StudioLoginDebugPanel } from "@/features/admin/components/StudioLoginDebugPanel"
import { StudioClientsPanel } from "@/features/admin/components/StudioClientsPanel"
import { notifyLaneAPendingChanged } from "@/features/admin/lane-a-pending"
import { api } from "@/lib/kyClient"

type Health = {
  ok: boolean
  vam1?: boolean
  vaf1?: boolean
  vam?: boolean
  vaf?: boolean
  va?: boolean
  error?: string
}

type PreviewSlot = {
  mannequin: string
  iso: string | null
  bust: number
  pending: boolean
  error: string | null
}

type AccountStatus = {
  username: string
  exists: boolean
  userLevel: number
  isAdmin: boolean
  enabled: boolean
  characterName: string | null
  characterExists: boolean
  characterGender: number | null
  characterZone: number | null
  accountUid: string | null
  characterUid: string | null
}

type StudioAccountsOverview = {
  vam1: AccountStatus
  vaf1: AccountStatus
}

type SeedSuccessResponse = {
  message: string
  passwords: {
    vam1: string
    vaf1: string
  }
}

type StudioConnectionSettings = {
  studioUrl: string
  previewUrl: string
  studioTokenConfigured: boolean
  workerTokenConfigured: boolean
  studioTokenFromEnv: boolean
  workerTokenFromEnv: boolean
  channelTokenConfigured?: boolean
  channelTokenMatchesWebsite?: boolean
}

const PREVIEW_ROLES = ["vam1", "vaf1"] as const

export function StudioDressPanel() {
  const [mannequin, setMannequin] = useState("vam1")
  const [source, setSource] = useState("")
  const [pose, setPose] = useState(true)
  const [health, setHealth] = useState<Health | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  // Connection settings (studio URL / tokens)
  const [conn, setConn] = useState<StudioConnectionSettings | null>(null)
  const [connLoading, setConnLoading] = useState(false)
  const [connSaving, setConnSaving] = useState(false)
  const [connError, setConnError] = useState<string | null>(null)
  const [connOk, setConnOk] = useState<string | null>(null)
  const [studioUrlDraft, setStudioUrlDraft] = useState("")
  const [previewUrlDraft, setPreviewUrlDraft] = useState("")
  const [studioTokenDraft, setStudioTokenDraft] = useState("")
  const [workerTokenDraft, setWorkerTokenDraft] = useState("")
  const [channelRestartNeeded, setChannelRestartNeeded] = useState(false)
  const [connTesting, setConnTesting] = useState(false)
  const [connTestDetail, setConnTestDetail] = useState<string | null>(null)

  // Mannequin Accounts Seed State
  const [accounts, setAccounts] = useState<StudioAccountsOverview | null>(null)
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [accountsError, setAccountsError] = useState<string | null>(null)
  const [seedPending, setSeedPending] = useState(false)
  const [seedError, setSeedError] = useState<string | null>(null)
  const [seedSuccess, setSeedSuccess] = useState<SeedSuccessResponse | null>(null)
  const [showPasswordFields, setShowPasswordFields] = useState(false)
  const [customVamPass, setCustomVamPass] = useState("")
  const [customVafPass, setCustomVafPass] = useState("")

  const [previews, setPreviews] = useState<Record<string, PreviewSlot>>(() =>
    Object.fromEntries(
      PREVIEW_ROLES.map((m) => [
        m,
        { mannequin: m, iso: null, bust: 0, pending: false, error: null },
      ])
    )
  )

  const refreshAccounts = useCallback(async () => {
    setAccountsLoading(true)
    setAccountsError(null)
    try {
      const response = await api("admin/studio/seed")
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: StudioAccountsOverview
      }
      if (!response.ok || !json.success || !json.data) {
        setAccounts(null)
        setAccountsError(json.message || `HTTP ${response.status}`)
        return
      }
      setAccounts(json.data)
    } catch (err) {
      setAccounts(null)
      setAccountsError(
        err instanceof Error ? err.message : "Failed to load mannequin accounts"
      )
    } finally {
      setAccountsLoading(false)
    }
  }, [])

  const refreshHealth = useCallback(async () => {
    setRefreshing(true)
    setHealthError(null)
    try {
      const response = await api("admin/studio/health")
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: Health
      }
      if (!response.ok || !json.success || !json.data) {
        setHealth(null)
        setHealthError(json.message || `HTTP ${response.status}`)
        return
      }
      setHealth(json.data)
    } catch (err) {
      setHealth(null)
      setHealthError(err instanceof Error ? err.message : "Health failed")
    } finally {
      setRefreshing(false)
    }
  }, [])

  const refreshPreviewMeta = useCallback(async () => {
    try {
      const response = await api("admin/studio/preview")
      const json = (await response.json()) as {
        success?: boolean
        data?: {
          previews?: Array<{
            mannequin: string
            iso: string | null
            hasImage?: boolean
          }>
        }
      }
      if (!response.ok || !json.success || !json.data?.previews) return
      setPreviews((prev) => {
        const next = { ...prev }
        for (const row of json.data!.previews!) {
          const cur = next[row.mannequin]
          if (!cur) continue
          next[row.mannequin] = {
            ...cur,
            iso: row.iso,
            bust: row.hasImage ? cur.bust || Date.now() : cur.bust,
          }
        }
        return next
      })
    } catch {
      /* ignore — previews optional */
    }
  }, [])

  const refreshConn = useCallback(async () => {
    setConnLoading(true)
    setConnError(null)
    try {
      const response = await api("admin/studio/settings")
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { settings?: StudioConnectionSettings }
      }
      if (!response.ok || !json.success || !json.data?.settings) {
        setConnError(json.message || `HTTP ${response.status}`)
        return
      }
      const s = json.data.settings
      setConn(s)
      setStudioUrlDraft(s.studioUrl)
      setPreviewUrlDraft(s.previewUrl)
    } catch (err) {
      setConnError(
        err instanceof Error ? err.message : "Failed to load studio settings"
      )
    } finally {
      setConnLoading(false)
    }
  }, [])

  async function saveConn() {
    setConnSaving(true)
    setConnError(null)
    setConnOk(null)
    try {
      const payload: {
        studioUrl: string
        previewUrl: string
        studioToken?: string
        workerToken?: string
      } = {
        studioUrl: studioUrlDraft.trim(),
        previewUrl: previewUrlDraft.trim(),
      }
      if (studioTokenDraft.trim()) payload.studioToken = studioTokenDraft.trim()
      if (workerTokenDraft.trim()) payload.workerToken = workerTokenDraft.trim()

      const response = await api.put("admin/studio/settings", {
        json: payload,
        timeout: 60_000,
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: {
          settings?: StudioConnectionSettings
          channelSync?: {
            draftUpdated?: boolean
            restartNeeded?: boolean
            warning?: string
            message?: string
          }
        }
      }
      if (!response.ok || !json.success || !json.data?.settings) {
        setConnError(json.message || `HTTP ${response.status}`)
        return
      }
      const s = json.data.settings
      setConn(s)
      setStudioUrlDraft(s.studioUrl)
      setPreviewUrlDraft(s.previewUrl)
      setStudioTokenDraft("")
      setWorkerTokenDraft("")
      const sync = json.data.channelSync
      const needsRestart = Boolean(sync?.restartNeeded)
      setChannelRestartNeeded(needsRestart)
      if (needsRestart) {
        notifyLaneAPendingChanged()
      }
      setConnOk(json.message || "Studio connection settings saved")
      void refreshHealth()
    } catch (err) {
      setConnError(
        err instanceof Error ? err.message : "Failed to save studio settings"
      )
    } finally {
      setConnSaving(false)
    }
  }

  async function testConn() {
    setConnTesting(true)
    setConnError(null)
    setConnOk(null)
    setConnTestDetail(null)
    try {
      const response = await api.post("admin/studio/test-connection", {
        json: {
          studioUrl: studioUrlDraft.trim(),
          previewUrl: previewUrlDraft.trim(),
          studioToken: studioTokenDraft.trim() || undefined,
          workerToken: workerTokenDraft.trim() || undefined,
        },
        timeout: 20_000,
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: {
          ok?: boolean
          channel?: {
            ok?: boolean
            detail?: string
            vam1?: boolean
            vaf1?: boolean
          }
          preview?: { ok?: boolean; skipped?: boolean; detail?: string }
          probed?: {
            studioUrl?: string
            previewUrl?: string | null
            studioTokenSource?: string
            workerTokenSource?: string
          }
        }
      }
      if (!response.ok || !json.success || !json.data) {
        setConnError(json.message || `HTTP ${response.status}`)
        return
      }
      const ch = json.data.channel
      const pv = json.data.preview
      const probed = json.data.probed
      const lines = [
        probed
          ? `Using studio token from ${probed.studioTokenSource} → ${probed.studioUrl}`
          : null,
        ch?.detail || "Channel: ?",
        ch?.ok
          ? `  vam1=${ch.vam1 ? "online" : "offline"} vaf1=${ch.vaf1 ? "online" : "offline"}`
          : null,
        probed?.previewUrl
          ? `Using worker token from ${probed.workerTokenSource} → ${probed.previewUrl}`
          : null,
        pv?.detail || null,
        !ch?.ok && probed?.studioTokenSource === "form"
          ? "Tip: clear the Studio token field and Test again (use saved token). Browsers often autofill the wrong password."
          : null,
      ].filter(Boolean)
      setConnTestDetail(lines.join("\n"))
      if (json.data.ok) {
        setConnOk(json.message || "Connection OK")
        void refreshHealth()
      } else {
        setConnError(json.message || "Connection issues")
      }
    } catch (err) {
      setConnError(
        err instanceof Error ? err.message : "Connection test failed"
      )
    } finally {
      setConnTesting(false)
    }
  }

  useEffect(() => {
    void refreshHealth()
    void refreshPreviewMeta()
    void refreshAccounts()
    void refreshConn()
  }, [refreshHealth, refreshPreviewMeta, refreshAccounts, refreshConn])

  async function onSeedAccounts() {
    setSeedPending(true)
    setSeedError(null)
    setSeedSuccess(null)
    try {
      const payload: { vamPass?: string; vafPass?: string } = {}
      if (customVamPass.trim()) payload.vamPass = customVamPass.trim()
      if (customVafPass.trim()) payload.vafPass = customVafPass.trim()

      const response = await api("admin/studio/seed", {
        method: "POST",
        json: payload,
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: {
          message: string
          passwords: {
            vam1: string
            vaf1: string
          }
        }
      }

      if (!response.ok || !json.success) {
        setSeedError(json.message || `HTTP ${response.status}`)
        return
      }

      setSeedSuccess({
        message: json.message || "Mannequin accounts and characters seeded successfully.",
        passwords: json.data?.passwords ?? {
          vam1: customVamPass.trim() || "vam1vam1",
          vaf1: customVafPass.trim() || "vaf1vaf1",
        },
      })
      void refreshAccounts()
      void refreshHealth()
    } catch (err) {
      setSeedError(
        err instanceof Error ? err.message : "Failed to seed mannequin accounts"
      )
    } finally {
      setSeedPending(false)
    }
  }

  async function capturePreview(role: string) {
    setPreviews((prev) => ({
      ...prev,
      [role]: { ...prev[role], pending: true, error: null },
    }))
    try {
      const response = await api("admin/studio/preview", {
        method: "POST",
        json: { mannequin: role },
        timeout: 60000,
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { iso?: string; mannequin?: string }
      }
      if (!response.ok || !json.success) {
        setPreviews((prev) => ({
          ...prev,
          [role]: {
            ...prev[role],
            pending: false,
            error: json.message || `HTTP ${response.status}`,
          },
        }))
        return
      }
      setPreviews((prev) => ({
        ...prev,
        [role]: {
          ...prev[role],
          pending: false,
          error: null,
          iso: json.data?.iso ?? new Date().toISOString(),
          bust: Date.now(),
        },
      }))
      void refreshHealth()
    } catch (err) {
      setPreviews((prev) => ({
        ...prev,
        [role]: {
          ...prev[role],
          pending: false,
          error: err instanceof Error ? err.message : "Preview failed",
        },
      }))
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setOk(null)
    if (!source.trim()) {
      setError("Enter a source character name.")
      return
    }
    setPending(true)
    try {
      const response = await api("admin/studio/dress", {
        method: "POST",
        json: {
          mannequin: mannequin.trim(),
          source: source.trim(),
          pose,
        },
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setOk(json.message || "Dress applied.")
      void refreshHealth()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dress failed")
    } finally {
      setPending(false)
    }
  }

  function onlineLabel(name: string, online?: boolean) {
    if (online === true) return `${name}: in-world`
    if (online === false) return `${name}: not in-world`
    return `${name}: ?`
  }

  const vamOnline = Boolean(health?.vam1 || health?.vam)
  const vafOnline = Boolean(health?.vaf1 || health?.vaf)

  return (
    <div className="w-full space-y-3">
      {/* Status strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-border bg-card/60 px-3 py-2 text-xs">
        <span className="font-medium text-foreground">Studio</span>
        <span className={vamOnline ? "text-emerald-500" : "text-muted-foreground"}>
          {onlineLabel("vam1", health?.vam1 ?? health?.vam)}
        </span>
        <span className={vafOnline ? "text-emerald-500" : "text-muted-foreground"}>
          {onlineLabel("vaf1", health?.vaf1 ?? health?.vaf)}
        </span>
        {healthError ? (
          <span className="text-destructive truncate max-w-md">{healthError}</span>
        ) : null}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={refreshing}
            onClick={() => void refreshHealth()}
          >
            {refreshing ? "Refreshing…" : "Refresh health"}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-12 xl:items-start">
        {/* Left: controls */}
        <div className="space-y-3 xl:col-span-5 min-w-0">
          {/* Connection */}
          <div className="border border-border bg-card/60 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Connection</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Channel studio + Wine preview agent. Saving studio token also
                  updates channel draft StudioToken.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={connLoading}
                onClick={() => void refreshConn()}
              >
                {connLoading ? "…" : "Reload"}
              </Button>
            </div>

            {connError && <FormAlert variant="error">{connError}</FormAlert>}
            {connOk && <FormAlert variant="success">{connOk}</FormAlert>}
            {channelRestartNeeded ? (
              <p className="text-xs text-sky-600 dark:text-sky-400">
                Channel restart needed — Overview publish for new StudioToken.
              </p>
            ) : null}
            {connTestDetail ? (
              <pre className="whitespace-pre-wrap border border-border/60 bg-background/60 p-2 text-[11px] text-muted-foreground max-h-28 overflow-auto">
                {connTestDetail}
              </pre>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <Field className="gap-1">
                <FieldLabel htmlFor="studio-url" className="text-[11px]">
                  Studio URL
                </FieldLabel>
                <Input
                  id="studio-url"
                  placeholder="http://127.0.0.1:14700"
                  value={studioUrlDraft}
                  onChange={(e) => setStudioUrlDraft(e.target.value)}
                  autoComplete="off"
                  className="h-8 text-xs font-mono"
                />
              </Field>
              <Field className="gap-1">
                <FieldLabel htmlFor="studio-preview-url" className="text-[11px]">
                  Preview agent URL
                </FieldLabel>
                <Input
                  id="studio-preview-url"
                  placeholder="http://192.168.0.230:14701"
                  value={previewUrlDraft}
                  onChange={(e) => setPreviewUrlDraft(e.target.value)}
                  autoComplete="off"
                  className="h-8 text-xs font-mono"
                />
              </Field>
              <Field className="gap-1">
                <FieldLabel htmlFor="studio-token" className="text-[11px]">
                  Studio token
                </FieldLabel>
                <Input
                  id="studio-token"
                  type="password"
                  autoComplete="new-password"
                  data-1p-ignore
                  data-lpignore="true"
                  name="portrait-studio-token"
                  placeholder={
                    conn?.studioTokenConfigured
                      ? "Leave blank to keep"
                      : "Channel StudioToken"
                  }
                  value={studioTokenDraft}
                  onChange={(e) => setStudioTokenDraft(e.target.value)}
                  className="h-8 text-xs"
                />
              </Field>
              <Field className="gap-1">
                <FieldLabel htmlFor="studio-worker-token" className="text-[11px]">
                  Worker token
                </FieldLabel>
                <Input
                  id="studio-worker-token"
                  type="password"
                  autoComplete="new-password"
                  data-1p-ignore
                  data-lpignore="true"
                  name="portrait-worker-token"
                  placeholder={
                    conn?.workerTokenConfigured
                      ? "Leave blank to keep"
                      : "Optional (= studio)"
                  }
                  value={workerTokenDraft}
                  onChange={(e) => setWorkerTokenDraft(e.target.value)}
                  className="h-8 text-xs"
                />
              </Field>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={connSaving || connTesting}
                onClick={() => void saveConn()}
              >
                {connSaving ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={connSaving || connTesting}
                onClick={() => void testConn()}
              >
                {connTesting ? "Testing…" : "Test"}
              </Button>
            </div>
          </div>

          <StudioClientsPanel />

          <form
            className="border border-border bg-card/60 p-3 space-y-3"
            onSubmit={(e) => void onSubmit(e)}
          >
            <p className="text-sm font-medium">Dress mannequin</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field className="gap-1">
                <FieldLabel htmlFor="studio-mannequin" className="text-[11px]">
                  Mannequin
                </FieldLabel>
                <select
                  id="studio-mannequin"
                  className="h-8 w-full rounded-none border border-input bg-background px-2 text-xs"
                  value={mannequin}
                  onChange={(e) => setMannequin(e.target.value)}
                >
                  <option value="vam1">vam1 (male)</option>
                  <option value="vaf1">vaf1 (female)</option>
                </select>
              </Field>
              <Field className="gap-1">
                <FieldLabel htmlFor="studio-source" className="text-[11px]">
                  Source character
                </FieldLabel>
                <Input
                  id="studio-source"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder=""
                  autoComplete="off"
                  className="h-8 text-xs"
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={pose}
                onChange={(e) => setPose(e.target.checked)}
                className="size-3.5 rounded-none"
              />
              Pose in studio (zone 10105)
            </label>
            {error && <FormAlert variant="error">{error}</FormAlert>}
            {ok && <FormAlert variant="success">{ok}</FormAlert>}
            <Button type="submit" size="sm" disabled={pending || !source.trim()}>
              {pending ? "Dressing…" : "Dress"}
            </Button>
          </form>

          {/* Accounts */}
          <div className="border border-border bg-card/60 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Mannequin accounts</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Seed vam1 / vaf1 + studio chars (zone 10105).
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={accountsLoading}
                onClick={() => void refreshAccounts()}
              >
                {accountsLoading ? "…" : "Status"}
              </Button>
            </div>

            {accountsError && (
              <FormAlert variant="error">{accountsError}</FormAlert>
            )}

            {accounts && (
              <div className="grid gap-2 sm:grid-cols-2 text-xs">
                {(["vam1", "vaf1"] as const).map((role) => {
                  const a = accounts[role]
                  const label = role === "vam1" ? "vam1 (M)" : "vaf1 (F)"
                  return (
                    <div
                      key={role}
                      className="border border-border/80 bg-background/50 p-2 space-y-1"
                    >
                      <div className="flex items-center justify-between font-mono font-medium">
                        <span>{label}</span>
                        {a.isAdmin ? (
                          <span className="text-[10px] text-emerald-500">GM</span>
                        ) : a.exists ? (
                          <span className="text-[10px] text-yellow-500">
                            L{a.userLevel}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">
                            —
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground">
                        acct{" "}
                        {a.exists ? (
                          <span className="text-foreground">
                            {a.enabled ? "on" : "off"}
                          </span>
                        ) : (
                          <span className="text-destructive">missing</span>
                        )}{" "}
                        · char{" "}
                        {a.characterExists ? (
                          <span className="font-mono text-foreground">
                            {a.characterName}
                          </span>
                        ) : (
                          <span className="text-destructive">missing</span>
                        )}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}

            {showPasswordFields && (
              <div className="grid gap-2 sm:grid-cols-2 pt-1 border-t border-border/60">
                <Field className="gap-1">
                  <FieldLabel htmlFor="vam-pass" className="text-[11px]">
                    vam1 password
                  </FieldLabel>
                  <Input
                    id="vam-pass"
                    type="text"
                    placeholder="vam1vam1"
                    value={customVamPass}
                    onChange={(e) => setCustomVamPass(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </Field>
                <Field className="gap-1">
                  <FieldLabel htmlFor="vaf-pass" className="text-[11px]">
                    vaf1 password
                  </FieldLabel>
                  <Input
                    id="vaf-pass"
                    type="text"
                    placeholder="vaf1vaf1"
                    value={customVafPass}
                    onChange={(e) => setCustomVafPass(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </Field>
              </div>
            )}

            {seedError && <FormAlert variant="error">{seedError}</FormAlert>}
            {seedSuccess && (
              <div className="space-y-2">
                <FormAlert variant="success">{seedSuccess.message}</FormAlert>
                <div className="border border-emerald-500/30 bg-emerald-500/5 p-2 text-[11px] space-y-1 font-mono">
                  <p>
                    vam1 / {seedSuccess.passwords.vam1} (char vam)
                  </p>
                  <p>
                    vaf1 / {seedSuccess.passwords.vaf1} (char vaf)
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                size="sm"
                disabled={seedPending}
                onClick={() => void onSeedAccounts()}
              >
                {seedPending ? "Seeding…" : "Seed accounts"}
              </Button>
              <button
                type="button"
                onClick={() => setShowPasswordFields((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
              >
                {showPasswordFields ? "Hide passwords" : "Custom passwords"}
              </button>
            </div>
          </div>
        </div>

        {/* Right: visuals + tunables */}
        <div className="space-y-3 xl:col-span-7 min-w-0">
          <div className="border border-border bg-card/60 p-3 space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Remote preview</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Studio crop via preview agent (~8s cooldown).
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {PREVIEW_ROLES.map((role) => {
                const slot = previews[role]
                const src =
                  slot.bust > 0
                    ? `/api/admin/studio/preview/${role}?t=${slot.bust}`
                    : null
                return (
                  <div key={role} className="space-y-2 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium font-mono">
                        {role}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={slot.pending}
                        onClick={() => void capturePreview(role)}
                      >
                        {slot.pending ? "…" : "Snap"}
                      </Button>
                    </div>
                    {slot.iso && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        {slot.iso}
                      </p>
                    )}
                    {slot.error && (
                      <FormAlert variant="error">{slot.error}</FormAlert>
                    )}
                    <div className="flex min-h-52 items-center justify-center overflow-hidden border border-border bg-black/50">
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={src}
                          alt={`${role} studio preview`}
                          className="max-h-80 w-full object-contain"
                        />
                      ) : (
                        <span className="px-2 py-10 text-xs text-muted-foreground">
                          No shot
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <StudioLoginDebugPanel />
        </div>
      </div>
    </div>
  )
}
