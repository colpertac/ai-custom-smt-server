import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { execFile as execFileCb } from "node:child_process"

import JSZip from "jszip"

import { encryptWebaccessViaSidecar } from "@/lib/ops-sidecar"

const execFile = promisify(execFileCb)

export type VersionDataEntry = {
  title: string
  /** Lobby host written into VersionData `server =` */
  lobbyHost: string
  /** HTTP host for webaccess login URL (may differ from lobby host) */
  webHost: string
  tag: string
}

export type ClientPrepInput = {
  /** IP or hostname for lobby / ImagineClient / fallback */
  host: string
  /** Optional public hostname for updater + primary webaccess HTTP URLs */
  domain?: string
  lobbyPort?: number
  updaterPort?: number
  loginPort?: number
  updaterScheme?: "http" | "https"
  title?: string
  tag?: string
  /** ImagineUpdate Information= URL (portal); defaults to updater origin */
  websiteUrl?: string
  /** Add a second VersionData entry (e.g. 127.0.0.1 local dev) */
  includeLocalServer?: boolean
  localTitle?: string
  localHost?: string
  localTag?: string
}

export type ClientPrepFiles = Record<string, Buffer | string>

function httpHost(input: ClientPrepInput): string {
  const d = input.domain?.trim()
  if (d) return d
  return input.host.trim()
}

function lobbyHost(input: ClientPrepInput): string {
  return input.host.trim()
}

/** ImagineClient.dat: `-ip HOST\\r\\n-port PORT\\r\\n` */
export function buildImagineClientDat(
  host: string,
  lobbyPort: number
): Buffer {
  const text = `-ip ${host}\r\n-port ${lobbyPort}\r\n`
  return Buffer.from(text, "utf8")
}

export function buildImagineUpdateDat(
  baseHost: string,
  updaterPort: number,
  scheme: "http" | "https",
  websiteUrl?: string
): string {
  const origin = `${scheme}://${baseHost}:${updaterPort}`
  const info = websiteUrl?.trim() || `${origin}/`
  return `[Setting]\nBaseURL1 = ${origin}/files\nInformation = ${info}\n`
}

export function sanitizeVersionDataTag(tag: string): string {
  return tag.trim().replace(/[^\w.-]/g, "") || "local"
}

export function buildVersionData(
  entries: Array<{ title: string; lobbyHost: string; tag: string }>,
  lobbyPort: number
): string {
  if (entries.length === 0) {
    throw new Error("At least one VersionData server is required")
  }

  const seen = new Set<string>()
  let out = "[versions]\n"
  for (const entry of entries) {
    const tag = sanitizeVersionDataTag(entry.tag)
    if (seen.has(tag)) {
      throw new Error(`Duplicate VersionData tag: ${tag}`)
    }
    seen.add(tag)
    out +=
      `title = ${entry.title}\n` +
      `server = ${entry.lobbyHost}:${lobbyPort}\n` +
      `tag = ${tag}\n` +
      `\n`
  }

  for (const tag of seen) {
    out += `[${tag}]\nwebaccess.sdat\n\n`
  }

  return out.trimEnd() + "\n"
}

export function resolveVersionDataEntries(
  input: ClientPrepInput
): VersionDataEntry[] {
  const host = lobbyHost(input)
  if (!host) throw new Error("Host is required")

  const title = (input.title?.trim() || "Private SMT").slice(0, 80)
  const primaryTag = sanitizeVersionDataTag(input.tag || "local")
  const entries: VersionDataEntry[] = [
    {
      title,
      lobbyHost: host,
      webHost: httpHost(input),
      tag: primaryTag,
    },
  ]

  if (input.includeLocalServer) {
    const localHost = input.localHost?.trim() || "127.0.0.1"
    entries.push({
      title: (input.localTitle?.trim() || "Local Server").slice(0, 80),
      lobbyHost: localHost,
      webHost: localHost,
      tag: sanitizeVersionDataTag(input.localTag || "local"),
    })
  }

  const tags = new Set<string>()
  for (const entry of entries) {
    if (tags.has(entry.tag)) {
      throw new Error(`Duplicate VersionData tag: ${entry.tag}`)
    }
    tags.add(entry.tag)
  }

  return entries
}

export function buildWebaccessPlaintext(
  baseHost: string,
  loginPort: number,
  scheme: "http" | "https"
): string {
  return `<login = ${scheme}://${baseHost}:${loginPort}/>\n`
}

async function encryptWebaccessLocal(plaintext: Buffer): Promise<Buffer> {
  const candidates: string[] = []
  const envEncrypt = process.env.OPS_ENCRYPT?.trim()
  if (envEncrypt) candidates.push(envEncrypt)
  const binDir =
    process.env.COMP_TOOLS_BIN?.trim() || process.env.BIN_DIR?.trim() || ""
  if (binDir) candidates.push(path.join(binDir, "comp_encrypt"))
  // Common local builds next to this monorepo (smt/comp_hack/…)
  const smtRoot = path.resolve(process.cwd(), "..", "..")
  for (const rel of [
    "comp_hack/build-localdeps-v31/bin/comp_encrypt",
    "comp_hack/build-current/bin/comp_encrypt",
  ]) {
    candidates.push(path.join(smtRoot, rel))
  }

  const encrypt = candidates.find((p) => p && fs.existsSync(p))
  if (!encrypt) {
    throw new Error(
      "comp_encrypt unavailable (ops sidecar failed and no local tool found)"
    )
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "webaccess-enc-"))
  const plainPath = path.join(tmp, "in.dat")
  const outPath = path.join(tmp, "out.sdat")
  try {
    fs.writeFileSync(plainPath, plaintext)
    await execFile(encrypt, [plainPath, outPath], { timeout: 30_000 })
    return fs.readFileSync(outPath)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

export async function encryptWebaccess(plaintext: string): Promise<Buffer> {
  const buf = Buffer.from(plaintext, "utf8")
  try {
    const b64 = await encryptWebaccessViaSidecar(plaintext)
    return Buffer.from(b64, "base64")
  } catch (sidecarErr) {
    try {
      return await encryptWebaccessLocal(buf)
    } catch {
      throw sidecarErr instanceof Error
        ? sidecarErr
        : new Error("webaccess encrypt failed")
    }
  }
}

export async function buildClientPrepFiles(
  input: ClientPrepInput
): Promise<ClientPrepFiles> {
  const entries = resolveVersionDataEntries(input)
  const primary = entries[0]
  const webHost = httpHost(input)

  const lobbyPort = input.lobbyPort ?? 10666
  const updaterPort = input.updaterPort ?? 8765
  const loginPort = input.loginPort ?? 10999
  const scheme = input.updaterScheme ?? "http"

  const updateDat = buildImagineUpdateDat(
    webHost,
    updaterPort,
    scheme,
    input.websiteUrl
  )
  const versionData = buildVersionData(entries, lobbyPort)

  const files: ClientPrepFiles = {
    "ImagineClient.dat": buildImagineClientDat(
      primary.lobbyHost,
      lobbyPort
    ),
    "ImagineUpdate.dat": updateDat,
    "ImagineUpdate-user.dat": updateDat,
    "VersionData.txt": versionData,
    "VersionData-user.txt": versionData,
  }

  for (const entry of entries) {
    const plain = buildWebaccessPlaintext(entry.webHost, loginPort, scheme)
    const encrypted = await encryptWebaccess(plain)
    files[`webaccess.sdat.${entry.tag}`] = encrypted
  }

  files["webaccess.sdat"] = files[`webaccess.sdat.${primary.tag}`]

  return files
}

export async function buildClientPrepZip(
  input: ClientPrepInput
): Promise<Buffer> {
  const files = await buildClientPrepFiles(input)
  const zip = new JSZip()
  for (const [name, body] of Object.entries(files)) {
    zip.file(name, body)
  }
  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  })
}
