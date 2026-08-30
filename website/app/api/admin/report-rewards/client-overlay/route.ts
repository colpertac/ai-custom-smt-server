import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail } from "@/lib/api-response"
import { normalizeGlobalFile } from "@/lib/report-reward-normalize"
import { putReportRewardGlobalSchema } from "@/lib/report-reward-schema"
import {
  buildClientOverlayZip,
  resolveClientOverlayFromGlobal,
} from "@/lib/report-reward-client-overlay"
import {
  readChoiceMessagesStore,
  readReportRewardGlobal,
  writeChoiceMessagesStore,
} from "@/lib/report-rewards-fs"
import { upsertCeventMessagesViaSidecar } from "@/lib/ops-sidecar"
import { requireWebSession } from "@/lib/web-session"

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const globalFile = await readReportRewardGlobal()
    const choiceStore = await readChoiceMessagesStore()
    const preview = resolveClientOverlayFromGlobal(globalFile, choiceStore)
    if (!preview.customMessages.length) {
      return apiFail(
        "No custom NPC packages in saved config — stock dialog covers all package costs.",
        400,
        "NO_CUSTOM_PACKAGES"
      )
    }

    let store = choiceStore
    if (preview.allocated) {
      await writeChoiceMessagesStore(preview.choiceStore)
      store = preview.choiceStore
    }

    const upsert = await upsertCeventMessagesViaSidecar(
      preview.customMessages,
      session.username
    )
    if (!upsert.ok) {
      return apiFail(
        upsert.detail ??
          "Failed to build CEventMessage overlay (check deploy/ops-tools)",
        502,
        "CEVENT_UPSERT"
      )
    }

    const { zipBytes, filename } = await buildClientOverlayZip({
      globalFile,
      choiceStore: store,
      upsertDetail: upsert.detail,
    })

    return new Response(new Uint8Array(zipBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Client overlay export failed",
      500,
      "CLIENT_OVERLAY"
    )
  }
}

export async function POST(request: Request) {
  const blocked = await guardApiMutation(
    "admin-report-rewards-client-overlay",
    20,
    60_000
  )
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "VALIDATION")
  }

  const parsed = putReportRewardGlobalSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid body",
      400,
      "VALIDATION"
    )
  }

  try {
    const globalFile = normalizeGlobalFile(parsed.data)
    const choiceStore = await readChoiceMessagesStore()
    const preview = resolveClientOverlayFromGlobal(globalFile, choiceStore)
    if (!preview.customMessages.length) {
      return apiFail(
        "No custom NPC packages — all package costs use stock client dialog strings.",
        400,
        "NO_CUSTOM_PACKAGES"
      )
    }

    let store = choiceStore
    if (preview.allocated) {
      await writeChoiceMessagesStore(preview.choiceStore)
      store = preview.choiceStore
    }

    const upsert = await upsertCeventMessagesViaSidecar(
      preview.customMessages,
      session.username
    )
    if (!upsert.ok) {
      return apiFail(
        upsert.detail ??
          "Failed to build CEventMessage overlay (check deploy/ops-tools)",
        502,
        "CEVENT_UPSERT"
      )
    }

    const { zipBytes, filename } = await buildClientOverlayZip({
      globalFile,
      choiceStore: store,
      upsertDetail: upsert.detail,
    })

    return new Response(new Uint8Array(zipBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Client overlay export failed",
      500,
      "CLIENT_OVERLAY"
    )
  }
}
