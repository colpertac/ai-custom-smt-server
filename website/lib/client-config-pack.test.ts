import { describe, expect, it } from "vitest"

import {
  buildVersionData,
  resolveVersionDataEntries,
  sanitizeVersionDataTag,
} from "./client-config-pack"

describe("buildVersionData", () => {
  it("builds a single-server file", () => {
    const text = buildVersionData(
      [{ title: "Private SMT", lobbyHost: "192.168.0.230", tag: "main" }],
      10666
    )
    expect(text).toBe(
      `[versions]
title = Private SMT
server = 192.168.0.230:10666
tag = main

[main]
webaccess.sdat
`
    )
  })

  it("builds multi-server VersionData like Reimagine", () => {
    const text = buildVersionData(
      [
        {
          title: "ReIMAGINE",
          lobbyHost: "tokyo.reimagine.online",
          tag: "reimagine",
        },
        { title: "Local Server", lobbyHost: "127.0.0.1", tag: "local" },
      ],
      10666
    )
    expect(text).toContain("title = ReIMAGINE")
    expect(text).toContain("server = tokyo.reimagine.online:10666")
    expect(text).toContain("tag = reimagine")
    expect(text).toContain("title = Local Server")
    expect(text).toContain("server = 127.0.0.1:10666")
    expect(text).toContain("[reimagine]\nwebaccess.sdat")
    expect(text).toContain("[local]\nwebaccess.sdat")
  })

  it("rejects duplicate tags", () => {
    expect(() =>
      buildVersionData(
        [
          { title: "A", lobbyHost: "1.1.1.1", tag: "local" },
          { title: "B", lobbyHost: "127.0.0.1", tag: "local" },
        ],
        10666
      )
    ).toThrow(/Duplicate VersionData tag/)
  })
})

describe("resolveVersionDataEntries", () => {
  it("adds local server when requested", () => {
    const entries = resolveVersionDataEntries({
      host: "192.168.0.230",
      domain: "play.example.com",
      title: "My Server",
      tag: "main",
      includeLocalServer: true,
      localTitle: "Local Server",
      localHost: "127.0.0.1",
      localTag: "local",
    })
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      title: "My Server",
      lobbyHost: "192.168.0.230",
      webHost: "play.example.com",
      tag: "main",
    })
    expect(entries[1]).toMatchObject({
      title: "Local Server",
      lobbyHost: "127.0.0.1",
      webHost: "127.0.0.1",
      tag: "local",
    })
  })

  it("rejects duplicate primary and local tags", () => {
    expect(() =>
      resolveVersionDataEntries({
        host: "192.168.0.230",
        tag: "local",
        includeLocalServer: true,
        localTag: "local",
      })
    ).toThrow(/Duplicate VersionData tag/)
  })
})

describe("sanitizeVersionDataTag", () => {
  it("strips invalid characters", () => {
    expect(sanitizeVersionDataTag(" my-tag! ")).toBe("my-tag")
  })
})
