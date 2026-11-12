import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/** deploy/entrypoint.sh studio_patch: STUDIO_TOKEN → runtime channel.xml (zero-config). */
const ENTRYPOINT = path.resolve(__dirname, "../../deploy/entrypoint.sh")
const SEED_CHANNEL = path.resolve(__dirname, "../../deploy/seed/config/channel.xml")

function run(xml: string, studioToken?: string): string {
  const env = { ...process.env }
  delete env.STUDIO_TOKEN
  if (studioToken !== undefined) env.STUDIO_TOKEN = studioToken
  return execFileSync("bash", ["-c", `source "${ENTRYPOINT}"; studio_patch 2>/dev/null`], {
    input: xml,
    env,
    encoding: "utf8",
  })
}

function members(xml: string, name: string): string[] {
  const re = new RegExp(`<member name="${name}">([^<]*)</member>`, "g")
  return [...xml.matchAll(re)].map((m) => m[1])
}

describe("entrypoint.sh studio_patch", () => {
  const seed = fs.readFileSync(SEED_CHANNEL, "utf8")

  it("adds StudioToken + StudioHttpPort 14700 to the seed channel.xml", () => {
    const out = run(seed, "abc123")
    expect(members(out, "StudioToken")).toEqual(["abc123"])
    expect(members(out, "StudioHttpPort")).toEqual(["14700"])
    expect(out.indexOf("StudioToken")).toBeLessThan(out.lastIndexOf("</object>"))
    expect(out).toContain('<member name="Name">Some Channel</member>')
  })

  it("replaces an existing token and keeps a non-zero port", () => {
    const xml = seed.replace(
      "</object>",
      '    <member name="StudioHttpPort">14800</member>\n        <member name="StudioToken">old</member>\n    </object>'
    )
    const out = run(xml, "newtok")
    expect(members(out, "StudioToken")).toEqual(["newtok"])
    expect(members(out, "StudioHttpPort")).toEqual(["14800"])
  })

  it("sets port 14700 when it is 0", () => {
    const xml = seed.replace(
      "</object>",
      '    <member name="StudioHttpPort">0</member>\n    </object>'
    )
    expect(members(run(xml, "t"), "StudioHttpPort")).toEqual(["14700"])
  })

  it("leaves the file unchanged without STUDIO_TOKEN or with unsafe characters", () => {
    expect(run(seed)).toBe(seed)
    expect(run(seed, "")).toBe(seed)
    expect(run(seed, "a<b")).toBe(seed)
  })
})

