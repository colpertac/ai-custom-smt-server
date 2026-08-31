import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { execFile as execFileCb } from "node:child_process"

import JSZip from "jszip"

import { encryptWebaccessViaSidecar } from "@/lib/ops-sidecar"

const execFile = promisify(execFileCb)

export type ClientPrepInput = {
  /** IP or hostname for lobby / ImagineClient / fallback */
  host: string
  /** Optional public hostname for updater + webaccess HTTP URLs */
  domain?: string
  lobbyPort?: number
  updaterPort?: number
  loginPort?: number
  updaterScheme?: "http" | "https"
  title?: string
  tag?: string
  /** ImagineUpdate Information= URL (portal); defaults to updater origin */
  websiteUrl?: string
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

export function buildVersionData(
  title: string,
  host: string,
  lobbyPort: number,
  tag: string
): string {
  return (
    `[versions]\n` +
    `title = ${title}\n` +
    `server = ${host}:${lobbyPort}\n` +
    `tag = ${tag}\n` +
    `\n` +
    `[${tag}]\n` +
    `webaccess.sdat\n`
  )
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
  const host = lobbyHost(input)
  const webHost = httpHost(input)
  if (!host) throw new Error("Host is required")

  const lobbyPort = input.lobbyPort ?? 10666
  const updaterPort = input.updaterPort ?? 8765
  const loginPort = input.loginPort ?? 10999
  const scheme = input.updaterScheme ?? "http"
  const title = (input.title?.trim() || "Private SMT").slice(0, 80)
  const tag = (input.tag?.trim() || "local").replace(/[^\w.-]/g, "") || "local"

  const updateDat = buildImagineUpdateDat(
    webHost,
    updaterPort,
    scheme,
    input.websiteUrl
  )
  const versionData = buildVersionData(title, host, lobbyPort, tag)
  const plain = buildWebaccessPlaintext(webHost, loginPort, scheme)
  const encrypted = await encryptWebaccess(plain)

  return {
    "ImagineClient.dat": buildImagineClientDat(host, lobbyPort),
    "ImagineUpdate.dat": updateDat,
    "ImagineUpdate-user.dat": updateDat,
    "VersionData.txt": versionData,
    "VersionData-user.txt": versionData,
    "webaccess.sdat": encrypted,
    "webaccess.sdat.local": encrypted,
  }
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
