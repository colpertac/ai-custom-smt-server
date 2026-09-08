/**
 * Keep channel.xml StudioToken draft in sync with Admin → Studio.
 * Writes working config only — does not publish or restart.
 * Overview blue-dot (channelDirty) signals publish/restart needed.
 */

import {
  loadConfigDocument,
  saveConfigDocument,
} from "@/lib/server-config/fs"
import type { ObjgenDocument } from "@/lib/server-config/types"

export type ChannelStudioSyncResult = {
  draftUpdated: boolean
  /** Always false — publish/restart is left to Overview. */
  published: boolean
  restarted: boolean
  restartNeeded: boolean
  message: string
  warning?: string
}

export async function readChannelStudioToken(): Promise<string> {
  const { document } = await loadConfigDocument("channel")
  const doc = document as ObjgenDocument
  return String(doc.members["StudioToken"] ?? "").trim()
}

/**
 * Set channel StudioToken in the working draft (and ensure StudioHttpPort if unset).
 * Does not publish to live or restart channel.
 */
export async function syncChannelStudioToken(
  token: string,
  _actor?: string
): Promise<ChannelStudioSyncResult> {
  const trimmed = token.trim()
  if (!trimmed) {
    throw new Error("Studio token is empty")
  }

  const { document } = await loadConfigDocument("channel")
  const doc = document as ObjgenDocument
  const prev = String(doc.members["StudioToken"] ?? "").trim()
  doc.members["StudioToken"] = trimmed

  const portRaw = doc.members["StudioHttpPort"]
  const port = typeof portRaw === "number" ? portRaw : Number(portRaw)
  if (!Number.isFinite(port) || port <= 0) {
    doc.members["StudioHttpPort"] = 14700
  }

  await saveConfigDocument("channel", doc)
  const draftUpdated = prev !== trimmed

  return {
    draftUpdated,
    published: false,
    restarted: false,
    restartNeeded: true,
    message: draftUpdated
      ? "Studio token saved to website and channel draft"
      : "Studio token already set on channel draft; website settings saved",
    warning: "Channel restart needed — publish from Overview to apply",
  }
}
