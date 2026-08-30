import { afterEach, describe, expect, it, vi } from "vitest"

import { opsBaseUrl, opsToken } from "@/lib/ops-sidecar"

describe("ops sidecar env", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("defaults URL to loopback 14710", () => {
    vi.stubEnv("OPS_URL", "")
    expect(opsBaseUrl()).toBe("http://127.0.0.1:14710")
  })

  it("strips trailing slash on OPS_URL", () => {
    vi.stubEnv("OPS_URL", "http://127.0.0.1:14710/")
    expect(opsBaseUrl()).toBe("http://127.0.0.1:14710")
  })

  it("reads OPS_TOKEN", () => {
    vi.stubEnv("OPS_TOKEN", "secret")
    expect(opsToken()).toBe("secret")
  })
})
