import { ATLAS_ASK_MODEL } from "@/lib/ask-atlas-constants"
import type { AskCitation, AskMatch } from "@/lib/ask-retrieval"

export const ATLAS_BASE_URL = "https://api.atlascloud.ai/v1"

export const ATLAS_DEFAULT_MAX_TOKENS = 3072
export const ATLAS_DEFAULT_TEMPERATURE = 0.5

export type AtlasChatRole = "system" | "user" | "assistant"

export type AtlasChatMessage = {
  role: AtlasChatRole
  content: string
}

export type AtlasChatCompletionResult =
  | { ok: true; content: string }
  | { ok: false; error: string }

type AtlasChatResponseBody = {
  choices?: Array<{
    message?: { content?: string | null }
  }>
  error?: { message?: string }
}

export function buildAskSystemPrompt(context: {
  answer: string
  citations: AskCitation[]
  matches?: AskMatch[]
}): string {
  const citationLines =
    context.citations.length > 0
      ? context.citations
          .map((c) => `- ${c.label} (${c.ref})`)
          .join("\n")
      : "(none)"

  const matchLines =
    context.matches && context.matches.length > 0
      ? context.matches
          .map((m) => `- Quest ${m.id}: ${m.title} (score ${m.score})`)
          .join("\n")
      : "(none)"

  return [
    "You are the Help assistant for a Shin Megami Tensei Imagine private-server website.",
    "Answer ONLY using the retrieved catalog context below.",
    "Cite quest IDs and source paths when you mention specific quests, NPCs, or steps.",
    "If the context says the topic is not in the catalog, say so clearly — do not guess.",
    "Never invent quest IDs, item IDs, NPC IDs, zone IDs, or drop tables not present in the context.",
    "Refuse account access, passwords, exploits, cheating, GM tools, or server hacking — redirect to normal quest help.",
    "Keep answers concise and player-friendly (markdown lists and headings are fine).",
    "",
    "## Retrieved catalog context",
    context.answer.trim() || "(empty)",
    "",
    "## Citations",
    citationLines,
    "",
    "## Top catalog matches",
    matchLines,
  ].join("\n")
}

export function buildGroundedAskMessages(input: {
  retrievalAnswer: string
  citations: AskCitation[]
  matches?: AskMatch[]
  conversation: Array<{ role: "user" | "assistant"; content: string }>
  maxHistoryTurns?: number
}): AtlasChatMessage[] {
  const systemContent = buildAskSystemPrompt({
    answer: input.retrievalAnswer,
    citations: input.citations,
    matches: input.matches,
  })

  const history = input.conversation
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
    )
    .slice(-(input.maxHistoryTurns ?? 8))

  return [{ role: "system", content: systemContent }, ...history]
}

export async function chatAtlasDeepSeek(options: {
  apiKey: string
  messages: AtlasChatMessage[]
  maxTokens?: number
  temperature?: number
  fetchImpl?: typeof fetch
}): Promise<AtlasChatCompletionResult> {
  const fetchFn = options.fetchImpl ?? fetch
  const url = `${ATLAS_BASE_URL}/chat/completions`

  let response: Response
  try {
    response = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: ATLAS_ASK_MODEL,
        messages: options.messages,
        max_tokens: options.maxTokens ?? ATLAS_DEFAULT_MAX_TOKENS,
        temperature: options.temperature ?? ATLAS_DEFAULT_TEMPERATURE,
        stream: false,
      }),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error"
    return { ok: false, error: message }
  }

  let body: AtlasChatResponseBody
  try {
    body = (await response.json()) as AtlasChatResponseBody
  } catch {
    return { ok: false, error: `Invalid response (${response.status})` }
  }

  if (!response.ok) {
    const message =
      body.error?.message ||
      `Atlas API error (${response.status})`
    return { ok: false, error: message }
  }

  const content = body.choices?.[0]?.message?.content?.trim()
  if (!content) {
    return { ok: false, error: "Empty model response" }
  }

  return { ok: true, content }
}
