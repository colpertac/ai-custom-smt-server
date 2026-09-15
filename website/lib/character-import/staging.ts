import { randomBytes } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { STAGING_TTL_MS } from "@/lib/character-import/types"

type StageMeta = {
  username: string
  createdAt: number
  filename: string
}

function stagingRoot(): string {
  return path.join(os.tmpdir(), "smt-char-import")
}

function userDir(username: string): string {
  const safe = username.toLowerCase().replace(/[^a-z0-9_-]/g, "_")
  return path.join(stagingRoot(), safe)
}

function metaPath(dir: string, token: string): string {
  return path.join(dir, `${token}.json`)
}

function xmlPath(dir: string, token: string): string {
  return path.join(dir, `${token}.xml`)
}

function purgeExpired(dir: string): void {
  if (!fs.existsSync(dir)) return
  const now = Date.now()
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue
    const full = path.join(dir, name)
    try {
      const meta = JSON.parse(fs.readFileSync(full, "utf8")) as StageMeta
      if (now - meta.createdAt > STAGING_TTL_MS) {
        const token = name.replace(/\.json$/, "")
        fs.rmSync(full, { force: true })
        fs.rmSync(xmlPath(dir, token), { force: true })
      }
    } catch {
      fs.rmSync(full, { force: true })
    }
  }
}

/** Stage uploaded XML for a short TTL; returns opaque token. */
export function stageBackupXml(
  username: string,
  xml: string,
  filename: string
): string {
  const dir = userDir(username)
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  purgeExpired(dir)

  const token = randomBytes(24).toString("hex")
  const meta: StageMeta = {
    username: username.toLowerCase(),
    createdAt: Date.now(),
    filename: filename || "backup.xml",
  }
  fs.writeFileSync(xmlPath(dir, token), xml, { encoding: "utf8", mode: 0o600 })
  fs.writeFileSync(metaPath(dir, token), JSON.stringify(meta), {
    encoding: "utf8",
    mode: 0o600,
  })
  return token
}

export function readStagedBackup(
  username: string,
  token: string
): { xml: string; filename: string } {
  if (!/^[a-f0-9]{32,64}$/i.test(token)) {
    throw new Error("Invalid upload token")
  }
  const dir = userDir(username)
  purgeExpired(dir)
  const metaFile = metaPath(dir, token)
  if (!fs.existsSync(metaFile)) {
    throw new Error("Upload expired or not found — please re-upload the file")
  }
  const meta = JSON.parse(fs.readFileSync(metaFile, "utf8")) as StageMeta
  if (meta.username !== username.toLowerCase()) {
    throw new Error("Upload token mismatch")
  }
  if (Date.now() - meta.createdAt > STAGING_TTL_MS) {
    clearStagedBackup(username, token)
    throw new Error("Upload expired — please re-upload the file")
  }
  const xml = fs.readFileSync(xmlPath(dir, token), "utf8")
  return { xml, filename: meta.filename }
}

export function clearStagedBackup(username: string, token: string): void {
  const dir = userDir(username)
  fs.rmSync(metaPath(dir, token), { force: true })
  fs.rmSync(xmlPath(dir, token), { force: true })
}
