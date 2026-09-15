"use client"

import { FormEvent, useCallback, useState } from "react"
import { useSearchParams } from "next/navigation"

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

type AskResponse = {
  ok: boolean
  answer: string
  citations: AskCitation[]
  matches?: AskMatch[]
}

export function AskPanel({ initialQuery = "" }: { initialQuery?: string }) {
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(
    initialQuery || searchParams.get("q") || ""
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AskResponse | null>(null)

  const submit = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: trimmed }),
      })
      const body = (await res.json()) as AskResponse & { message?: string }
      if (!res.ok && !body.answer) {
        setError(body.message ?? "Request failed.")
        setResult(null)
        return
      }
      setResult(body)
    } catch {
      setError("Could not reach the help service.")
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void submit(query)
  }

  return (
    <div className="space-y-8">
      <form onSubmit={onSubmit} className="space-y-3">
        <label htmlFor="ask-query" className="sr-only">
          Your question
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="ask-query"
            name="q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="How do I complete The Guard's Desire?"
            className="h-11 flex-1 border-border bg-background/80"
            autoComplete="off"
            maxLength={400}
          />
          <Button type="submit" disabled={loading || !query.trim()} className="h-11 shrink-0 uppercase tracking-wider">
            {loading ? "Searching…" : "Ask"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Answers come from exported quest catalogs and reviewed notes — not
          generic wiki lore.
        </p>
      </form>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <section
          className={cn(
            "border border-border bg-card/60 p-5",
            !result.ok && "border-muted-foreground/30"
          )}
          aria-live="polite"
        >
          <NewsMarkdown source={result.answer} />

          {result.citations.length > 0 ? (
            <div className="mt-8 border-t border-border pt-4">
              <h2 className="font-heading text-xs font-semibold tracking-[0.14em] uppercase text-gold-dim">
                Sources
              </h2>
              <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                {result.citations.map((cite) => (
                  <li key={`${cite.kind}-${cite.ref}`}>
                    <span className="font-medium text-foreground/80">
                      {cite.label}
                    </span>
                    <span className="mx-1.5 text-faint">·</span>
                    <code className="font-mono text-[0.72rem]">{cite.ref}</code>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.matches && result.matches.length > 1 ? (
            <div className="mt-6 border-t border-border pt-4">
              <h2 className="font-heading text-xs font-semibold tracking-[0.14em] uppercase text-gold-dim">
                Other matches
              </h2>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {result.matches.slice(1, 4).map((m) => (
                  <li key={m.id}>
                    Quest {m.id}: {m.title}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
