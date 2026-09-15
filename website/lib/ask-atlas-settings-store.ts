import { ATLAS_ASK_MODEL } from "@/lib/ask-atlas-constants"
import {
  deleteSiteSetting,
  getSiteSetting,
  setSiteSetting,
} from "@/lib/site-settings-store"

const KEY_ATLAS_API_KEY = "atlascloud_api_key"
const KEY_ASK_LLM_ENABLED = "ask_llm_enabled"

export { ATLAS_ASK_MODEL } from "@/lib/ask-atlas-constants"

export type AtlasApiKeyStatus = {
  configured: boolean
  hint: string | null
}

export type AskAtlasAdminSettings = AtlasApiKeyStatus & {
  enabled: boolean
  model: typeof ATLAS_ASK_MODEL
}

function maskApiKeyHint(key: string): string {
  if (key.length <= 4) return "…"
  return `…${key.slice(-4)}`
}

/** Resolved key: site_settings first, then `ATLASCLOUD_API_KEY` env. Never log this. */
export function getAtlasCloudApiKey(): string | undefined {
  const fromStore = getSiteSetting(KEY_ATLAS_API_KEY)?.trim()
  if (fromStore) return fromStore
  const fromEnv = process.env.ATLASCLOUD_API_KEY?.trim()
  return fromEnv || undefined
}

export function setAtlasCloudApiKey(apiKey: string): void {
  const trimmed = apiKey.trim()
  if (!trimmed) return
  setSiteSetting(KEY_ATLAS_API_KEY, trimmed)
}

export function clearAtlasCloudApiKey(): void {
  deleteSiteSetting(KEY_ATLAS_API_KEY)
}

export function hasAtlasCloudApiKey(): boolean {
  return Boolean(getAtlasCloudApiKey())
}

export function getAtlasCloudApiKeyStatus(): AtlasApiKeyStatus {
  const key = getAtlasCloudApiKey()
  if (!key) {
    return { configured: false, hint: null }
  }
  return { configured: true, hint: maskApiKeyHint(key) }
}

export function isAskLlmEnabled(): boolean {
  const raw = getSiteSetting(KEY_ASK_LLM_ENABLED)
  if (raw === null) {
    return hasAtlasCloudApiKey()
  }
  return raw === "1" || raw === "true"
}

export function setAskLlmEnabled(enabled: boolean): void {
  setSiteSetting(KEY_ASK_LLM_ENABLED, enabled ? "1" : "0")
}

export function getAskAtlasAdminSettings(): AskAtlasAdminSettings {
  const keyStatus = getAtlasCloudApiKeyStatus()
  return {
    ...keyStatus,
    enabled: isAskLlmEnabled(),
    model: ATLAS_ASK_MODEL,
  }
}

export function isAskLlmConfigured(): boolean {
  return hasAtlasCloudApiKey() && isAskLlmEnabled()
}
