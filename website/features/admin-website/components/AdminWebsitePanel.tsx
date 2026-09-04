"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Upload } from "lucide-react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { api } from "@/lib/kyClient"
import {
  DEFAULT_SITE_ICON_URL,
  DEFAULT_SITE_NAME,
} from "@/lib/website-branding"

type WebsiteBranding = {
  siteName: string
  hasCustomIcon: boolean
  iconUrl: string | null
}

export function AdminWebsitePanel() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [siteName, setSiteName] = useState(DEFAULT_SITE_NAME)
  const [branding, setBranding] = useState<WebsiteBranding | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const applyBranding = useCallback((next: WebsiteBranding) => {
    setBranding(next)
    setSiteName(next.siteName)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api("admin/website/settings")
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { branding?: WebsiteBranding }
      }
      if (!response.ok || !json.success || !json.data?.branding) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      applyBranding(json.data.branding)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load branding")
    } finally {
      setLoading(false)
    }
  }, [applyBranding])

  useEffect(() => {
    void load()
  }, [load])

  const saveName = async () => {
    setSaving(true)
    setError(null)
    setOk(null)
    try {
      const response = await api.put("admin/website/settings", {
        json: { siteName },
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { branding?: WebsiteBranding }
      }
      if (!response.ok || !json.success || !json.data?.branding) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      applyBranding(json.data.branding)
      setOk("Site name saved")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const uploadIcon = async (file: File) => {
    setUploading(true)
    setError(null)
    setOk(null)
    try {
      const form = new FormData()
      form.append("file", file)
      const response = await api.post("admin/website/icon", { body: form })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { branding?: WebsiteBranding }
      }
      if (!response.ok || !json.success || !json.data?.branding) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      applyBranding(json.data.branding)
      setOk("Icon uploaded")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  const resetIcon = async () => {
    setResetting(true)
    setError(null)
    setOk(null)
    try {
      const response = await api.delete("admin/website/icon")
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { branding?: WebsiteBranding }
      }
      if (!response.ok || !json.success || !json.data?.branding) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      applyBranding(json.data.branding)
      setOk("Icon reset to default")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed")
    } finally {
      setResetting(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  const previewSrc = branding?.iconUrl ?? DEFAULT_SITE_ICON_URL

  return (
    <div className="space-y-6">
      {error ? <FormAlert>{error}</FormAlert> : null}
      {ok ? <FormAlert variant="success">{ok}</FormAlert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Site name</CardTitle>
          <CardDescription>
            Shown in the header next to the icon. With two or more words, the
            last word uses the gold accent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="website-site-name">Display name</FieldLabel>
              <Input
                id="website-site-name"
                maxLength={80}
                placeholder={DEFAULT_SITE_NAME}
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
              />
            </Field>
          </FieldGroup>
          <Button
            type="button"
            size="sm"
            disabled={saving || !siteName.trim()}
            onClick={() => void saveName()}
          >
            {saving ? "Saving…" : "Save name"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Site icon</CardTitle>
          <CardDescription>
            Header and favicon-style mark. PNG, JPEG, WebP, or ICO — max 512
            KiB.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewSrc}
              alt="Site icon preview"
              width={56}
              height={56}
              className="size-14 rounded-sm border border-border bg-black/40 object-contain"
            />
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>
                {branding?.hasCustomIcon
                  ? "Custom icon is active."
                  : "Using the default site icon."}
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.ico,image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ""
              if (!file) return
              void uploadIcon(file)
            }}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploading || resetting}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload data-icon="inline-start" />
              {uploading ? "Uploading…" : "Upload icon"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!branding?.hasCustomIcon || uploading || resetting}
              onClick={() => void resetIcon()}
            >
              {resetting ? "Resetting…" : "Reset to default"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
