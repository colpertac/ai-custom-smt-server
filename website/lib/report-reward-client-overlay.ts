import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import JSZip from "jszip"

import { normalizeGlobalFile } from "./report-reward-normalize.ts"
import type {
  ChoiceMessagesStore,
  CustomEventMessage,
  ReportRewardGlobal,
  ReportRewardGlobalFile,
} from "./report-reward-types.ts"
import {
  resolveTradeTiersWithMessages,
  tradeTiersMissingStockLabels,
} from "./report-reward-types.ts"
import {
  CEVENT_OVERLAY_COMPRESSED_REL,
  CEVENT_OVERLAY_REL,
} from "./report-reward-client-overlay-paths.ts"

export { CEVENT_OVERLAY_COMPRESSED_REL, CEVENT_OVERLAY_REL }

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(LIB_DIR, "../..")

export function updaterRoot(): string {
  const custom =
    process.env.OPS_UPDATER_ROOT?.trim() || process.env.UPDATER_ROOT?.trim()
  if (custom) return path.resolve(custom)
  return path.join(REPO_ROOT, "updater")
}

export function overlayShieldPath(rel: string): string {
  return path.join(updaterRoot(), "overlay", rel)
}

export type ClientOverlayResolveResult = {
  missingStock: Array<{ cost: number; cp: number }>
  customMessages: CustomEventMessage[]
  choiceStore: ChoiceMessagesStore
  allocated: boolean
}

export function resolveClientOverlayFromGlobal(
  globalFile: ReportRewardGlobalFile,
  choiceStore: ChoiceMessagesStore
): ClientOverlayResolveResult {
  const global = normalizeGlobalFile(globalFile).global
  const missing = tradeTiersMissingStockLabels(
    global.itemsPerCp,
    global.cpPackages
  )
  const resolved = resolveTradeTiersWithMessages(
    global.itemsPerCp,
    global.cpPackages,
    choiceStore
  )
  return {
    missingStock: missing.map((t) => ({ cost: t.cost, cp: t.cp })),
    customMessages: resolved.customMessages,
    choiceStore: resolved.store,
    allocated: resolved.allocated,
  }
}

export function buildClientOverlayInstallReadme(input: {
  messages: CustomEventMessage[]
  missingStock: Array<{ cost: number; cp: number }>
  overlayWritten: boolean
  upsertDetail?: string
}): string {
  const lines: string[] = [
    "Custom NPC dialog patch (CEventMessageData2)",
    "============================================",
    "",
    "Adds dialog button labels for CP trader packages that use non-stock",
    "item costs (not 10 / 50 / 100 / …). Required for custom NPC packages",
    "configured in Admin → Dungeon loot → Advanced.",
    "",
    "Manual install — copy into your game client folder:",
    "",
    `  ${CEVENT_OVERLAY_REL}`,
    `  ${CEVENT_OVERLAY_COMPRESSED_REL}  (optional; updater downloads the .compressed file)`,
    "",
    "Paths are relative to the folder that contains ImagineClient.exe.",
    "",
    "Examples:",
    "  Windows:  C:\\Games\\SMT\\BinaryData\\Shield\\CEventMessageData2.sbin",
    "  Wine:     ~/.wine/drive_c/Games/SMT/BinaryData/Shield/CEventMessageData2.sbin",
    "",
    "Recommended: run ImagineUpdate.exe from your client folder so the server",
    "overlay is applied automatically (same files as this zip).",
    "",
  ]

  if (input.missingStock.length) {
    lines.push("Custom packages in this patch:")
    for (const row of input.missingStock) {
      lines.push(`  - ${row.cost} items → ${row.cp} CP`)
    }
    lines.push("")
  }

  if (input.messages.length) {
    lines.push("CEventMessage IDs (button text = item cost):")
    for (const msg of [...input.messages].sort((a, b) => a.id - b.id)) {
      const label = msg.lines[0] ?? String(msg.id)
      lines.push(`  ${msg.id} → "${label}"`)
    }
    lines.push("")
  } else {
    lines.push("No custom CEventMessage rows are required for the current packages.")
    lines.push("")
  }

  if (input.overlayWritten) {
    lines.push("Overlay file was regenerated on the server before packaging this zip.")
  }
  if (input.upsertDetail) {
    lines.push(`Server note: ${input.upsertDetail}`)
  }

  lines.push("")
  lines.push(`Generated: ${new Date().toISOString()}`)
  return lines.join("\n")
}

async function readIfExists(filePath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(filePath)
  } catch {
    return null
  }
}

export async function buildClientOverlayZip(input: {
  globalFile: ReportRewardGlobalFile
  choiceStore: ChoiceMessagesStore
  upsertDetail?: string
}): Promise<{
  zipBytes: Uint8Array
  resolve: ClientOverlayResolveResult
  filename: string
}> {
  const resolve = resolveClientOverlayFromGlobal(
    input.globalFile,
    input.choiceStore
  )

  if (!resolve.customMessages.length) {
    throw new Error(
      "No custom NPC packages — all package costs use stock client dialog strings."
    )
  }

  const sbin = await readIfExists(overlayShieldPath(CEVENT_OVERLAY_REL))
  if (!sbin?.length) {
    throw new Error(
      `${CEVENT_OVERLAY_REL} not found in updater overlay. Run Publish from Admin → Power (or fix ops-tools) so CEventMessage can be patched.`
    )
  }

  const compressed = await readIfExists(
    overlayShieldPath(CEVENT_OVERLAY_COMPRESSED_REL)
  )

  const readme = buildClientOverlayInstallReadme({
    messages: resolve.customMessages,
    missingStock: resolve.missingStock,
    overlayWritten: Boolean(input.upsertDetail),
    upsertDetail: input.upsertDetail,
  })

  const messagesJson = JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      messages: resolve.customMessages,
      packages: resolve.missingStock,
    },
    null,
    2
  )

  const zip = new JSZip()
  zip.file("INSTALL.txt", readme)
  zip.file("custom-cevent-messages.json", messagesJson)
  zip.file(CEVENT_OVERLAY_REL, sbin)
  if (compressed?.length) {
    zip.file(CEVENT_OVERLAY_COMPRESSED_REL, compressed)
  }

  const zipBytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  })

  const stamp = new Date().toISOString().slice(0, 10)
  return {
    zipBytes,
    resolve,
    filename: `smt-custom-npc-dialog-${stamp}.zip`,
  }
}

export type ReportRewardGlobalInput = ReportRewardGlobal | ReportRewardGlobalFile

export function asGlobalFile(
  input: ReportRewardGlobalInput
): ReportRewardGlobalFile {
  if ("global" in input && input.global) {
    return input as ReportRewardGlobalFile
  }
  return {
    version: 1,
    global: input as ReportRewardGlobal,
  }
}
