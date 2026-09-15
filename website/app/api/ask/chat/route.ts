import { headers } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

import {
  getAtlasCloudApiKey,
  isAskLlmConfigured,
} from "@/lib/ask-atlas-settings-store"
import {
  ASK_MAX_QUERY_LENGTH,
  ASK_REFUSAL_MESSAGE,
  isRefusedAskQuery,
} from "@/lib/ask-guard"
import {
  buildGroundedAskMessages,
  chatAtlasDeepSeek,
} from "@/lib/atlas-deepseek"
import { retrieveAskAnswer } from "@/lib/ask-retrieval"
import {
  clientIpFromHeaders,
  clientKey,
  rateLimit,
} from "@/lib/rate-limit"

const ASK_CHAT_RATE_LIMIT = 10
const ASK_CHAT_RATE_WINDOW_MS = 60_000

const LLM_FALLBACK_NOTE =
  "\n\n*(AI assistant unavailable; showing catalog lookup.)*"

type ChatRole = "user" | "assistant" | "system"

type IncomingMessage = {
  role: ChatRole
  content: string
}

function parseMessages(body: unknown): IncomingMessage[] {
  if (typeof body !== "object" || body == null || !("messages" in body)) {
    return []
  }
  const raw = (body as { messages: unknown }).messages
  if (!Array.isArray(raw)) return []

  const out: IncomingMessage[] = []
  for (const item of raw) {
    if (typeof item !== "object" || item == null) continue
    const role = (item as { role?: unknown }).role
    const content = (item as { content?: unknown }).content
    if (
      (role === "user" || role === "assistant" || role === "system") &&
      typeof content === "string"
    ) {
      out.push({ role, content })
    }
  }
  return out
}

function readOptionalQuery(body: unknown): string {
  if (typeof body !== "object" || body == null || !("q" in body)) return ""
  const q = (body as { q: unknown }).q
  return typeof q === "string" ? q.trim() : ""
}

function latestUserQuestion(
  messages: IncomingMessage[],
  qOverride: string
): string {
  if (qOverride) return qOverride
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg?.role === "user" && msg.content.trim()) {
      return msg.content.trim()
    }
  }
  return ""
}

function conversationForLlm(
  messages: IncomingMessage[]
): Array<{ role: "user" | "assistant"; content: string }> {
  return messages
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        (m.role === "user" || m.role === "assistant") &&
        m.content.trim().length > 0
    )
    .map((m) => ({ role: m.role, content: m.content.trim() }))
}

export async function POST(req: NextRequest) {
  const h = await headers()
  const limited = rateLimit(
    clientKey("ask-chat", clientIpFromHeaders(h)),
    ASK_CHAT_RATE_LIMIT,
    ASK_CHAT_RATE_WINDOW_MS
  )
  if (!limited.ok) {
    return NextResponse.json(
      {
        ok: false,
        answer: `Too many chat messages. Try again in ${limited.retryAfterSec}s.`,
        citations: [],
        matches: [],
        mode: "retrieval",
      },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSec) },
      }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      {
        ok: false,
        answer: "Invalid JSON body.",
        citations: [],
        matches: [],
        mode: "retrieval",
      },
      { status: 400 }
    )
  }

  const messages = parseMessages(body)
  const qOverride = readOptionalQuery(body)
  const question = latestUserQuestion(messages, qOverride)

  if (!question) {
    return NextResponse.json(
      {
        ok: false,
        answer:
          'Missing question. Send `{ "messages": [{ "role": "user", "content": "..." }] }` or `{ "q": "..." }`.',
        citations: [],
        matches: [],
        mode: "retrieval",
      },
      { status: 400 }
    )
  }

  if (question.length > ASK_MAX_QUERY_LENGTH) {
    return NextResponse.json(
      {
        ok: false,
        answer: `Question is too long (max ${ASK_MAX_QUERY_LENGTH} characters).`,
        citations: [],
        matches: [],
        mode: "retrieval",
      },
      { status: 400 }
    )
  }

  if (isRefusedAskQuery(question)) {
    return NextResponse.json({
      ok: false,
      answer: ASK_REFUSAL_MESSAGE,
      citations: [],
      matches: [],
      mode: "retrieval",
    })
  }

  const retrieval = retrieveAskAnswer(question)

  if (!isAskLlmConfigured()) {
    return NextResponse.json({
      ok: retrieval.ok,
      answer: retrieval.answer,
      citations: retrieval.citations,
      matches: retrieval.matches,
      mode: "retrieval",
    })
  }

  const apiKey = getAtlasCloudApiKey()
  if (!apiKey) {
    return NextResponse.json({
      ok: retrieval.ok,
      answer: retrieval.answer,
      citations: retrieval.citations,
      matches: retrieval.matches,
      mode: "retrieval",
    })
  }

  const llmMessages = buildGroundedAskMessages({
    retrievalAnswer: retrieval.answer,
    citations: retrieval.citations,
    matches: retrieval.matches,
    conversation: conversationForLlm(messages),
  })

  const llmResult = await chatAtlasDeepSeek({ apiKey, messages: llmMessages })

  if (!llmResult.ok) {
    return NextResponse.json({
      ok: retrieval.ok,
      answer: retrieval.answer.trimEnd() + LLM_FALLBACK_NOTE,
      citations: retrieval.citations,
      matches: retrieval.matches,
      mode: "retrieval",
    })
  }

  return NextResponse.json({
    ok: retrieval.ok,
    answer: llmResult.content,
    citations: retrieval.citations,
    matches: retrieval.matches,
    mode: "llm",
  })
}
