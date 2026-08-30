import { describe, expect, it } from "vitest"

import { withUsernameLock } from "@/lib/comp-session-lock"

describe("withUsernameLock", () => {
  it("serializes concurrent work for the same user", async () => {
    const order: string[] = []
    const slow = withUsernameLock("alice", async () => {
      order.push("a-start")
      await new Promise((r) => setTimeout(r, 40))
      order.push("a-end")
      return 1
    })
    const fast = withUsernameLock("alice", async () => {
      order.push("b-start")
      order.push("b-end")
      return 2
    })
    const [a, b] = await Promise.all([slow, fast])
    expect(a).toBe(1)
    expect(b).toBe(2)
    expect(order).toEqual(["a-start", "a-end", "b-start", "b-end"])
  })

  it("allows different users in parallel", async () => {
    let concurrent = 0
    let max = 0
    const run = (name: string) =>
      withUsernameLock(name, async () => {
        concurrent += 1
        max = Math.max(max, concurrent)
        await new Promise((r) => setTimeout(r, 30))
        concurrent -= 1
      })
    await Promise.all([run("a"), run("b")])
    expect(max).toBe(2)
  })
})
