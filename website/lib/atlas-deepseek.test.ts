import { describe, expect, it, vi } from "vitest"

import { ATLAS_ASK_MODEL } from "@/lib/ask-atlas-constants"
import {
  ATLAS_BASE_URL,
  buildAskSystemPrompt,
  buildGroundedAskMessages,
  chatAtlasDeepSeek,
} from "@/lib/atlas-deepseek"

describe("atlas-deepseek", () => {
  it("builds a grounded system prompt from retrieval context", () => {
    const prompt = buildAskSystemPrompt({
      answer: "# Quest 5\nStart in Home III.",
      citations: [
        {
          kind: "quests",
          label: "Quest 5: The Guard's Desire",
          ref: "website/content/wiki/quests.json#5",
        },
      ],
      matches: [{ id: 5, title: "The Guard's Desire", score: 500 }],
    })

    expect(prompt).toMatch(/Answer ONLY using the retrieved catalog context/)
    expect(prompt).toMatch(/Quest 5/)
    expect(prompt).toMatch(/quests\.json#5/)
    expect(prompt).toMatch(/Never invent quest IDs/)
  })

  it("assembles chat messages with system context and history", () => {
    const messages = buildGroundedAskMessages({
      retrievalAnswer: "Catalog body",
      citations: [],
      conversation: [
        { role: "user", content: "How do I start quest 5?" },
        { role: "assistant", content: "Talk to the guard." },
        { role: "user", content: "Where is the guard?" },
      ],
    })

    expect(messages[0]?.role).toBe("system")
    expect(messages[0]?.content).toContain("Catalog body")
    expect(messages.at(-1)).toEqual({
      role: "user",
      content: "Where is the guard?",
    })
  })

  it("calls Atlas chat completions with bearer auth", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        choices: [{ message: { content: "Grounded answer." } }],
      })
    )

    const result = await chatAtlasDeepSeek({
      apiKey: "sk-test-key",
      messages: [{ role: "user", content: "quest 5" }],
      fetchImpl,
    })

    expect(result).toEqual({ ok: true, content: "Grounded answer." })
    expect(fetchImpl).toHaveBeenCalledOnce()

    const call = fetchImpl.mock.calls[0]
    expect(call).toBeDefined()
    const [url, init] = call as unknown as [string, RequestInit]
    expect(url).toBe(`${ATLAS_BASE_URL}/chat/completions`)
    expect(init.headers).toMatchObject({
      Authorization: "Bearer sk-test-key",
    })

    const body = JSON.parse(String(init.body)) as {
      model: string
      max_tokens: number
      stream: boolean
    }
    expect(body.model).toBe(ATLAS_ASK_MODEL)
    expect(body.max_tokens).toBeLessThanOrEqual(4096)
    expect(body.stream).toBe(false)
  })

  it("returns error details when Atlas responds with failure", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { error: { message: "Invalid API key" } },
        { status: 401 }
      )
    )

    const result = await chatAtlasDeepSeek({
      apiKey: "bad-key",
      messages: [{ role: "user", content: "hi" }],
      fetchImpl,
    })

    expect(result).toEqual({ ok: false, error: "Invalid API key" })
  })
})
