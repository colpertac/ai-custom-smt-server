import { readFile, readdir } from "node:fs/promises"
import path from "node:path"

import JSZip from "jszip"

import { apiFail } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { getShopsDir } from "@/lib/comp-shops-fs"
import { persistWebSession, requireWebSession } from "@/lib/web-session"

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const dir = getShopsDir()
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return apiFail("Working copy shops directory missing", 404, "NOT_FOUND")
  }

  const files = entries.filter((f) => /^compshop-\d+\.xml$/i.test(f)).sort()
  if (!files.length) {
    return apiFail("No COMP shops in working copy", 404, "NOT_FOUND")
  }

  const zip = new JSZip()
  for (const filename of files) {
    const xml = await readFile(path.join(dir, filename), "utf8")
    zip.file(filename, xml)
  }

  const buf = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  })
  await persistWebSession(session)

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="compshops.zip"',
    },
  })
}
