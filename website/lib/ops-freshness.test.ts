import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import {
  isChannelContentStale,
  isGameFilesRestartPending,
} from "@/lib/ops-freshness"

describe("ops freshness channel stale", () => {
  const prevOps = process.env.OPS_RUNTIME
  let tmp: string | null = null

  afterEach(() => {
    if (prevOps === undefined) delete process.env.OPS_RUNTIME
    else process.env.OPS_RUNTIME = prevOps
    if (tmp) {
      rmSync(tmp, { recursive: true, force: true })
      tmp = null
    }
  })

  it("is not stale with no content change stamp", () => {
    expect(isChannelContentStale({})).toBe(false)
  })

  it("is stale when content changed and channel never restarted", () => {
    expect(
      isChannelContentStale({ lastContentChangeAt: "2026-09-14T07:00:00+00:00" })
    ).toBe(true)
  })

  it("is stale when content change is after last restart", () => {
    expect(
      isChannelContentStale({
        lastContentChangeAt: "2026-09-14T08:00:00+00:00",
        lastChannelRestartAt: "2026-09-14T07:00:00+00:00",
      })
    ).toBe(true)
  })

  it("is not stale after a restart that is later than the upload", () => {
    expect(
      isChannelContentStale({
        lastContentChangeAt: "2026-09-14T07:00:00+00:00",
        lastChannelRestartAt: "2026-09-14T08:00:00+00:00",
      })
    ).toBe(false)
  })

  it("reads ops-freshness.json under OPS_RUNTIME", async () => {
    tmp = mkdtempSync(path.join(tmpdir(), "ops-fresh-"))
    process.env.OPS_RUNTIME = tmp
    mkdirSync(path.join(tmp, "releases"), { recursive: true })
    writeFileSync(
      path.join(tmp, "releases", "ops-freshness.json"),
      JSON.stringify({
        lastContentChangeAt: "2026-09-14T07:00:00+00:00",
        lastContentKinds: ["binarydata"],
      })
    )
    expect(await isGameFilesRestartPending()).toBe(true)
  })
})
