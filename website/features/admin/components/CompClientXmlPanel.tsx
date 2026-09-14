"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  ClientVersionMismatchBanner,
  syncClientVersionPair,
} from "@/features/admin/components/ClientVersionMismatchBanner"
import {
  COMP_CLIENT_CHANGED_EVENT,
  notifyLaneAPendingChanged,
  OPS_FRESHNESS_EVENT,
} from "@/features/admin/lane-a-pending"
import { DEFAULT_COMP_CLIENT_XML } from "@/lib/client-version-default"
import {
  describeClientVersionMismatch,
  parseCompClientVersion,
} from "@/lib/client-version-pair"
import { api } from "@/lib/kyClient"

type CompClientPayload = {
  xml?: string
  exists?: boolean
  lobbyVersion?: string
  lobbyCode?: number
  overlayCode?: number | null
}

export function CompClientXmlPanel() {
  const [xml, setXml] = useState("")
  const [exists, setExists] = useState(false)
  const [lobbyVersion, setLobbyVersion] = useState<string | null>(null)
  const [lobbyCode, setLobbyCode] = useState<number | null>(null)
  const [fixing, setFixing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const loadGen = useRef(0)
  const xmlRef = useRef("")
  const serverXmlRef = useRef("")

  useEffect(() => {
    xmlRef.current = xml
  }, [xml])

  const load = useCallback(async (opts?: { quiet?: boolean; force?: boolean }) => {
    const gen = ++loadGen.current
    if (!opts?.quiet) {
      setLoading(true)
      setError(null)
    }
    try {
      const response = await api.get("admin/ops/comp-client", {
        cache: "no-store",
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: CompClientPayload
      }
      if (gen !== loadGen.current) return
      if (!response.ok || !json.success || !json.data) {
        if (!opts?.quiet) {
          setError(json.message || `HTTP ${response.status}`)
        }
        setXml((prev) => prev || DEFAULT_COMP_CLIENT_XML)
        return
      }
      const next = json.data.xml || DEFAULT_COMP_CLIENT_XML
      setExists(Boolean(json.data.exists))
      setLobbyVersion(json.data.lobbyVersion ?? null)
      setLobbyCode(
        typeof json.data.lobbyCode === "number" ? json.data.lobbyCode : null
      )
      const dirty = xmlRef.current !== serverXmlRef.current
      if (opts?.quiet && !opts.force && dirty) return
      serverXmlRef.current = next
      setXml(next)
    } catch (e) {
      if (gen !== loadGen.current) return
      if (!opts?.quiet) {
        setError(e instanceof Error ? e.message : "Failed to load")
      }
      setXml((prev) => prev || DEFAULT_COMP_CLIENT_XML)
    } finally {
      if (gen === loadGen.current && !opts?.quiet) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const onFreshness = () => void load({ quiet: true })
    const onCompClient = () => void load({ quiet: true, force: true })
    window.addEventListener(OPS_FRESHNESS_EVENT, onFreshness)
    window.addEventListener(COMP_CLIENT_CHANGED_EVENT, onCompClient)
    return () => {
      window.removeEventListener(OPS_FRESHNESS_EVENT, onFreshness)
      window.removeEventListener(COMP_CLIENT_CHANGED_EVENT, onCompClient)
    }
  }, [load])

  const mismatch = useMemo(() => {
    if (lobbyCode == null) return null
    return describeClientVersionMismatch({
      lobbyCode,
      overlayCode: parseCompClientVersion(xml),
      overlayExists: exists || Boolean(xml.trim()),
    })
  }, [exists, lobbyCode, xml])

  const fixMismatch = useCallback(async () => {
    setFixing(true)
    setError(null)
    setOk(null)
    try {
      const liveCode = parseCompClientVersion(xml)
      const result = await syncClientVersionPair({
        hintCode: liveCode ?? undefined,
        xml: xml.trim() || undefined,
      })
      setOk(result.message)
      await load({ quiet: true, force: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed")
    } finally {
      setFixing(false)
    }
  }, [load, xml])

  const save = useCallback(async () => {
    setSaving(true)
    setError(null)
    setOk(null)
    try {
      const response = await api.put("admin/ops/comp-client", {
        json: { xml },
        timeout: 180_000,
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { message?: string }
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      const message = json.data?.message || json.message || "Saved"
      setOk(message)
      setExists(true)
      serverXmlRef.current = xml
      notifyLaneAPendingChanged()
      window.dispatchEvent(new Event(OPS_FRESHNESS_EVENT))
      window.dispatchEvent(new Event(COMP_CLIENT_CHANGED_EVENT))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }, [xml])

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Client patches (comp_client.xml)
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Paste the file from your game folder (next to ImagineClient.exe). Keep
          extra patches and compressors as-is — the website stores the XML
          verbatim on the updater. <code className="text-foreground">&lt;version&gt;</code>{" "}
          must match lobby ClientVersion × 1000
          {lobbyVersion ? ` (lobby is ${lobbyVersion})` : ""}. Not required to
          start servers.
        </p>
      </div>
      {error ? <FormAlert variant="error">{error}</FormAlert> : null}
      {ok ? <FormAlert variant="success">{ok}</FormAlert> : null}
      {mismatch?.mismatched ? (
        <ClientVersionMismatchBanner
          info={mismatch}
          busy={fixing || saving || loading}
          onFix={() => void fixMismatch()}
        />
      ) : null}
      <label className="flex max-w-3xl flex-col gap-1 text-sm">
        <span className="text-muted-foreground">
          {exists ? "Saved overlay copy" : "Not on the updater yet — default template loaded"}
        </span>
        <Textarea
          value={xml}
          onChange={(e) => setXml(e.target.value)}
          disabled={loading || saving || fixing}
          aria-label="comp_client.xml"
          className="min-h-[18rem] resize-y font-mono text-[0.7rem] leading-relaxed"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={loading || saving || fixing || !xml.trim()}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save to updater"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading || saving || fixing}
          onClick={() => {
            setXml(DEFAULT_COMP_CLIENT_XML)
            setOk(null)
            setError(null)
          }}
        >
          Load basic template
        </Button>
      </div>
    </section>
  )
}
