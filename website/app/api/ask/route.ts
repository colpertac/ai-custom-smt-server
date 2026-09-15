import { headers } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

import {
  ASK_MAX_QUERY_LENGTH,
  ASK_REFUSAL_MESSAGE,
  isRefusedAskQuery,
} from "@/lib/ask-guard"
import { retrieveAskAnswer } from "@/lib/ask-retrieval"
import {
  clientIpFromHeaders,
  clientKey,
  rateLimit,
} from "@/lib/rate-limit"

const ASK_RATE_LIMIT = 20
const ASK_RATE_WINDOW_MS = 60_000

function readQuery(req: NextRequest): string {
  const fromUrl = req.nextUrl.searchParams.get("q")
  if (fromUrl != null && fromUrl.trim()) {
    return fromUrl.trim()
  }
  return ""
}

async function handleAsk(query: string) {
  const q = query.trim()
  if (!q) {
    return NextResponse.json(
      {
        ok: false,
        answer: "Missing query. Send `{ \"q\": \"...\" }` or `?q=...`.",
        citations: [] as [],
        matches: [] as [],
      },
      { status: 400 }
    )
  }

  if (q.length > ASK_MAX_QUERY_LENGTH) {
    return NextResponse.json(
      {
        ok: false,
        answer: `Question is too long (max ${ASK_MAX_QUERY_LENGTH} characters).`,
        citations: [] as [],
        matches: [] as [],
      },
      { status: 400 }
    )
  }

  if (isRefusedAskQuery(q)) {
    return NextResponse.json({
      ok: false,
      answer: ASK_REFUSAL_MESSAGE,
      citations: [],
      matches: [],
    })
  }

  const result = retrieveAskAnswer(q)
  return NextResponse.json({
    ok: result.ok,
    answer: result.answer,
    citations: result.citations,
    matches: result.matches,
  })
}

export async function GET(req: NextRequest) {
  const h = await headers()
  const limited = rateLimit(
    clientKey("ask", clientIpFromHeaders(h)),
    ASK_RATE_LIMIT,
    ASK_RATE_WINDOW_MS
  )
  if (!limited.ok) {
    return NextResponse.json(
      {
        ok: false,
        answer: `Too many questions. Try again in ${limited.retryAfterSec}s.`,
        citations: [],
        matches: [],
      },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSec) },
      }
    )
  }

  return handleAsk(readQuery(req))
}

export async function POST(req: NextRequest) {
  const h = await headers()
  const limited = rateLimit(
    clientKey("ask", clientIpFromHeaders(h)),
    ASK_RATE_LIMIT,
    ASK_RATE_WINDOW_MS
  )
  if (!limited.ok) {
    return NextResponse.json(
      {
        ok: false,
        answer: `Too many questions. Try again in ${limited.retryAfterSec}s.`,
        citations: [],
        matches: [],
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
      },
      { status: 400 }
    )
  }

  const q =
    typeof body === "object" &&
    body != null &&
    "q" in body &&
    typeof (body as { q: unknown }).q === "string"
      ? (body as { q: string }).q.trim()
      : ""

  return handleAsk(q)
}
