import { getCompApiUrl } from "@/lib/env"

export type CompImportResult = {
  ok: boolean
  message: string
}

/**
 * Forward an account export XML to lobby `POST /import` (multipart).
 * Lobby must have AllowImport=true. Keep 10999 private.
 */
export async function importAccountXml(
  file: Blob,
  filename: string
): Promise<CompImportResult> {
  const body = new FormData()
  body.append("accountToImport", file, filename || "account.xml")

  const url = `${getCompApiUrl()}/import`
  const response = await fetch(url, {
    method: "POST",
    body,
    cache: "no-store",
  })

  const text = await response.text()
  let message = text.trim() || `HTTP ${response.status}`
  try {
    const json = JSON.parse(text) as { error?: string }
    if (typeof json.error === "string" && json.error) {
      message = json.error
    }
  } catch {
    /* plain text / empty */
  }

  // Lobby returns 200 with { error: "Success" } or { error: "<reason>" }.
  // 401 when AllowImport is false.
  if (response.status === 401) {
    return {
      ok: false,
      message: "Lobby rejected import (AllowImport disabled?)",
    }
  }
  if (!response.ok) {
    return { ok: false, message }
  }

  const ok = /^success$/i.test(message)
  return { ok, message }
}
