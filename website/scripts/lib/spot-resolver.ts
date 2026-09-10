/**
 * Resolve event NPC SpotIDs → world X/Y via DynamicMapData + SpotData binaries.
 * Uses comp_bdpatch (plaintext .bin load) from comp_hack build-localdeps.
 */
import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export type SpotXY = { x: number; y: number }

export type RawNpcPlacement = {
  nameJp: string
  zoneId: number
  /** 0 when the NPC is placed via explicit X/Y only (no active SpotID). */
  spotId: number
  /** Inline world coords from ServerNPC when present. */
  x: number | null
  y: number | null
}

type SpotResolverOptions = {
  repoRoot: string
  cacheDir?: string
}

function hasCjk(s: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(s)
}

/** Drop XML comments so commented-out SpotID / X / Y are not parsed as live. */
function stripXmlComments(s: string): string {
  return s.replace(/<!--[\s\S]*?-->/g, "")
}

function parseMemberNumber(
  body: string,
  member: string
): number | null {
  const m = body.match(
    new RegExp(`<member name="${member}">\\s*([^<]+?)\\s*</member>`)
  )
  if (!m) return null
  const n = Number(m[1].trim())
  return Number.isFinite(n) ? n : null
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function findBdpatch(repoRoot: string): Promise<string | null> {
  const candidates = [
    path.join(repoRoot, "comp_hack/build-localdeps-v31/bin/comp_bdpatch"),
    path.join(repoRoot, "comp_hack/build-localdeps/bin/comp_bdpatch"),
    path.join(repoRoot, "comp_hack/build-current/bin/comp_bdpatch"),
  ]
  for (const c of candidates) {
    if (await pathExists(c)) return c
  }
  return null
}

async function findClientBinDir(repoRoot: string): Promise<string | null> {
  const candidates = [
    path.join(repoRoot, "comp_hack/runtime/datastore/BinaryData/Client"),
    "/home/cat/software/smt/game/reimagine/BinaryData/Client",
  ]
  for (const c of candidates) {
    if (await pathExists(c)) return c
  }
  return null
}

async function ensureDynamicMapXml(
  bdpatch: string,
  clientDir: string,
  cacheDir: string
): Promise<string> {
  const outXml = path.join(cacheDir, "DynamicMapData.xml")
  if (await pathExists(outXml)) {
    const st = await fs.stat(outXml)
    if (st.size > 1000) return outXml
  }
  const binPath = path.join(clientDir, "DynamicMapData.bin")
  await fs.mkdir(cacheDir, { recursive: true })
  await execFileAsync(bdpatch, ["load", "dynamicmap", binPath, outXml], {
    maxBuffer: 32 * 1024 * 1024,
  })
  return outXml
}

function parseDynamicMapSpotFiles(xml: string): Map<number, string> {
  const map = new Map<number, string>()
  const objs = xml.matchAll(/<object name="MiDynamicMapData">([\s\S]*?)<\/object>/g)
  for (const m of objs) {
    const body = m[1]
    const id = body.match(/<member name="id">(\d+)<\/member>/)
    const file = body.match(
      /<member name="spotDataFile"><!\[CDATA\[(.*?)\]\]><\/member>/
    )
    if (id && file && file[1].trim()) {
      map.set(parseInt(id[1], 10), file[1].trim())
    }
  }
  return map
}

function parseSpotXml(xml: string): Map<number, SpotXY> {
  const spots = new Map<number, SpotXY>()
  const objs = xml.matchAll(/<object name="MiSpotData">([\s\S]*?)<\/object>/g)
  for (const m of objs) {
    const body = m[1]
    const id = body.match(/<member name="id">(\d+)<\/member>/)
    const x = body.match(/<member name="centerX">([^<]*)<\/member>/)
    const y = body.match(/<member name="centerY">([^<]*)<\/member>/)
    if (!id || !x || !y) continue
    const xf = Number(x[1])
    const yf = Number(y[1])
    if (!Number.isFinite(xf) || !Number.isFinite(yf)) continue
    spots.set(parseInt(id[1], 10), { x: xf, y: yf })
  }
  return spots
}

/**
 * Extract NPC placements from zone-partial XML.
 * Associates each commented ServerNPC with the enclosing ServerZonePartial's
 * DynamicMapIDs (skipping blanket overlays).
 *
 * Prefers an active (non-commented) SpotID; falls back to explicit X/Y when the
 * SpotID was removed after the live event (common in older clan contests).
 */
export function extractRawNpcPlacements(
  xmlContents: string[],
  blanketThreshold = 12
): RawNpcPlacement[] {
  const out: RawNpcPlacement[] = []

  for (const content of xmlContents) {
    const npcRe =
      /<!--\s*([^\n<>]+?)\s*-->\s*<object name="ServerNPC">([\s\S]*?)<\/object>/g
    let match: RegExpExecArray | null
    while ((match = npcRe.exec(content)) !== null) {
      const nameJp = match[1].trim()
      if (
        !nameJp ||
        nameJp.startsWith("Time-limited") ||
        nameJp.startsWith("Event indicator") ||
        nameJp.startsWith("Moved to") ||
        (/^Hide\b/i.test(nameJp) && !hasCjk(nameJp)) ||
        nameJp === "別のビーチへ移動"
      ) {
        continue
      }

      const body = stripXmlComments(match[2])
      const spotId = parseMemberNumber(body, "SpotID")
      const x = parseMemberNumber(body, "X")
      const y = parseMemberNumber(body, "Y")
      const hasSpot = spotId !== null && spotId > 0
      const hasXY = x !== null && y !== null
      if (!hasSpot && !hasXY) continue

      const before = content.slice(0, match.index)
      const partialStarts = [
        ...before.matchAll(/<object name="ServerZonePartial">/g),
      ]
      if (!partialStarts.length) continue
      const lastStart = partialStarts[partialStarts.length - 1].index!
      const partialHead = before.slice(lastStart)
      const mapBlock = partialHead.match(
        /<member name="DynamicMapIDs">\s*([\s\S]*?)\s*<\/member>/
      )
      if (!mapBlock) continue
      const mapIds = [...mapBlock[1].matchAll(/<element>(\d+)<\/element>/g)].map(
        (x) => parseInt(x[1], 10)
      )
      if (!mapIds.length) continue
      // Skip if this is somehow a blanket list with NPCs (rare) — still take first few hubs
      const zones =
        mapIds.length > blanketThreshold ? mapIds.slice(0, 3) : mapIds
      for (const zoneId of zones) {
        out.push({
          nameJp,
          zoneId,
          spotId: hasSpot ? spotId : 0,
          x: hasXY ? x : null,
          y: hasXY ? y : null,
        })
      }
    }
  }

  // Deduplicate identical placements
  const seen = new Set<string>()
  return out.filter((p) => {
    const key = `${p.nameJp}|${p.zoneId}|${p.spotId}|${p.x}|${p.y}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export class SpotResolver {
  private zoneToSpotFile = new Map<number, string>()
  private spotCache = new Map<string, Map<number, SpotXY>>()
  private ready = false
  private bdpatch: string | null = null
  private clientDir: string | null = null
  private cacheDir: string

  constructor(private readonly opts: SpotResolverOptions) {
    this.cacheDir =
      opts.cacheDir ?? path.join(os.tmpdir(), "smt-event-spot-cache")
  }

  async init(): Promise<void> {
    this.bdpatch = await findBdpatch(this.opts.repoRoot)
    this.clientDir = await findClientBinDir(this.opts.repoRoot)
    if (!this.bdpatch || !this.clientDir) {
      console.warn(
        "!! SpotResolver: missing comp_bdpatch or Client BinaryData — NPC positions will be null"
      )
      this.ready = false
      return
    }
    await fs.mkdir(this.cacheDir, { recursive: true })
    const dmXml = await ensureDynamicMapXml(
      this.bdpatch,
      this.clientDir,
      this.cacheDir
    )
    const xml = await fs.readFile(dmXml, "utf8")
    this.zoneToSpotFile = parseDynamicMapSpotFiles(xml)
    this.ready = true
    console.log(
      `==> SpotResolver ready: ${this.zoneToSpotFile.size} dynamic maps with SpotData`
    )
  }

  private async loadSpotFile(filename: string): Promise<Map<number, SpotXY>> {
    const cached = this.spotCache.get(filename)
    if (cached) return cached

    const empty = new Map<number, SpotXY>()
    if (!this.ready || !this.bdpatch || !this.clientDir) {
      this.spotCache.set(filename, empty)
      return empty
    }

    const binPath = path.join(this.clientDir, filename)
    if (!(await pathExists(binPath))) {
      this.spotCache.set(filename, empty)
      return empty
    }

    const safeName = filename.replace(/[^\w.-]+/g, "_")
    const outXml = path.join(this.cacheDir, `${safeName}.xml`)
    try {
      if (!(await pathExists(outXml))) {
        await execFileAsync(this.bdpatch, ["load", "spot", binPath, outXml], {
          maxBuffer: 64 * 1024 * 1024,
        })
      }
      const xml = await fs.readFile(outXml, "utf8")
      const spots = parseSpotXml(xml)
      this.spotCache.set(filename, spots)
      return spots
    } catch (err) {
      console.warn(`!! Failed to load SpotData ${filename}:`, err)
      this.spotCache.set(filename, empty)
      return empty
    }
  }

  async resolve(
    zoneId: number,
    spotId: number
  ): Promise<SpotXY | null> {
    // Prefer exact dynamic map; also try instanceId*100+1 style already handled by caller
    let file = this.zoneToSpotFile.get(zoneId)
    if (!file) {
      // Some arenas use DynamicMapID = instance*100+1 while zone XML ID is shorter
      file = this.zoneToSpotFile.get(zoneId * 10)
      if (!file && zoneId > 100) {
        // try stripping trailing digit patterns — no-op fallback
      }
    }
    // Pie arena: zone file 1131601 vs dynamic map 11316001
    if (!file && zoneId === 1131601) {
      file = this.zoneToSpotFile.get(11316001)
    }
    if (!file) return null
    const spots = await this.loadSpotFile(file)
    return spots.get(spotId) ?? null
  }

  async preloadZones(zoneIds: Iterable<number>): Promise<void> {
    const files = new Set<string>()
    for (const z of zoneIds) {
      const f =
        this.zoneToSpotFile.get(z) ||
        (z === 1131601 ? this.zoneToSpotFile.get(11316001) : undefined)
      if (f) files.add(f)
    }
    await Promise.all([...files].map((f) => this.loadSpotFile(f)))
  }
}
