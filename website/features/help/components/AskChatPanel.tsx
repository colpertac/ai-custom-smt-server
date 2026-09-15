"use client"

import { FormEvent, useCallback, useEffect, useRef, useState } from "react"

import { NewsMarkdown } from "@/components/news-markdown"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type AskCitation = {
  kind: string
  label: string
  ref: string
}

type AskMatch = {
  id: number
  title: string
  score: number
}

type ChatRole = "user" | "assistant"

type ChatMessage = {
  role: ChatRole
  content: string
  citations?: AskCitation[]
  matches?: AskMatch[]
  mode?: "llm" | "retrieval"
}

type ChatResponse = {
  ok: boolean
  answer: string
  citations: AskCitation[]
  matches?: AskMatch[]
  mode: "llm" | "retrieval"
}

function CitationsBlock({
  citations,
  matches,
}: {
  citations: AskCitation[]
  matches?: AskMatch[]
}) {
  if (citations.length === 0 && !(matches && matches.length > 1)) {
    return null
  }

  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      {citations.length > 0 ? (
        <>
          <h3 className="font-heading text-[0.65rem] font-semibold tracking-[0.14em] uppercase text-gold-dim">
            Sources
          </h3>
          <ul className="mt-2 space-y-1 text-[0.72rem] text-muted-foreground">
            {citations.map((cite) => (
              <li key={`${cite.kind}-${cite.ref}`}>
                <span className="font-medium text-foreground/80">
                  {cite.label}
                </span>
                <span className="mx-1.5 text-faint">·</span>
                <code className="font-mono text-[0.68rem]">{cite.ref}</code>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {matches && matches.length > 1 ? (
        <div className={citations.length > 0 ? "mt-4" : undefined}>
          <h3 className="font-heading text-[0.65rem] font-semibold tracking-[0.14em] uppercase text-gold-dim">
            Other matches
          </h3>
          <ul className="mt-2 space-y-1 text-[0.72rem] text-muted-foreground">
            {matches.slice(1, 4).map((m) => (
              <li key={m.id}>
                Quest {m.id}: {m.title}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

export function AskChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [llmConfigured, setLlmConfigured] = useState<boolean | null>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void fetch("/api/ask/status")
      .then((res) => res.json())
      .then((body: { llmConfigured?: boolean }) => {
        setLlmConfigured(Boolean(body.llmConfigured))
      })
      .catch(() => setLlmConfigured(false))
  }, [])

  useEffect(() => {
    const el = transcriptRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, loading])

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || loading) return

      const userMessage: ChatMessage = { role: "user", content: trimmed }
      const nextMessages = [...messages, userMessage]
      setMessages(nextMessages)
      setInput("")
      setLoading(true)
      setError(null)

      try {
        const res = await fetch("/api/ask/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: nextMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            q: trimmed,
          }),
        })
        const body = (await res.json()) as ChatResponse & { message?: string }
        if (!res.ok && !body.answer) {
          setError(body.message ?? "Chat request failed.")
          setMessages(messages)
          return
        }

        const assistant: ChatMessage = {
          role: "assistant",
          content: body.answer,
          citations: body.citations,
          matches: body.matches,
          mode: body.mode,
        }
        setMessages([...nextMessages, assistant])
      } catch {
        setError("Could not reach the help service.")
        setMessages(messages)
      } finally {
        setLoading(false)
      }
    },
    [loading, messages]
  )

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void send(input)
  }

  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant")

  return (
    <div className="space-y-4">
      {llmConfigured === false ? (
        <p
          className="border border-border/80 bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
          role="status"
        >
          Answers use catalog lookup only until an admin adds an Atlas API key
          on the website settings page.
        </p>
      ) : null}

      <div
        ref={transcriptRef}
        className="max-h-[28rem] min-h-[12rem] space-y-3 overflow-y-auto border border-border bg-card/40 p-4"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ask a quest question in plain language — for example, &ldquo;How do I
            complete The Guard&apos;s Desire?&rdquo;
          </p>
        ) : null}

        {messages.map((msg, index) => (
          <div
            key={`${msg.role}-${index}-${msg.content.slice(0, 24)}`}
            className={cn(
              "max-w-[92%] rounded-sm px-3 py-2 text-sm leading-relaxed",
              msg.role === "user"
                ? "ml-auto border border-gold-dim/30 bg-gold/5 text-foreground"
                : "mr-auto border border-border bg-background/80"
            )}
          >
            {msg.role === "assistant" ? (
              <NewsMarkdown source={msg.content} />
            ) : (
              <p>{msg.content}</p>
            )}
            {msg.role === "assistant" && msg.mode === "llm" ? (
              <p className="mt-2 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                AI answer · grounded in catalog
              </p>
            ) : null}
          </div>
        ))}

        {loading ? (
          <p className="text-xs text-muted-foreground">Thinking…</p>
        ) : null}
      </div>

      {lastAssistant &&
      lastAssistant.citations &&
      lastAssistant.citations.length > 0 ? (
        <section className="border border-border bg-card/60 p-4">
          <CitationsBlock
            citations={lastAssistant.citations}
            matches={lastAssistant.matches}
          />
        </section>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-2">
        <label htmlFor="ask-chat-input" className="sr-only">
          Chat message
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="ask-chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="How do I complete The Guard's Desire?"
            className="h-11 flex-1 border-border bg-background/80"
            autoComplete="off"
            maxLength={400}
            disabled={loading}
          />
          <Button
            type="submit"
            disabled={loading || !input.trim()}
            className="h-11 shrink-0 uppercase tracking-wider"
          >
            {loading ? "Sending…" : "Send"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Chat answers are grounded in exported quest catalogs and reviewed
          notes — not generic wiki lore.
        </p>
      </form>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
