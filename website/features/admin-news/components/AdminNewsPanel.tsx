"use client"

import { useCallback, useEffect, useState } from "react"

import { FormAlert } from "@/components/form-alert"
import { NewsMarkdown } from "@/components/news-markdown"
import { useConfirm } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/kyClient"

type NewsPost = {
  id: number
  title: string
  date: string
  summary: string
  body: string
  published: boolean
}

type Draft = {
  title: string
  date: string
  summary: string
  body: string
  published: boolean
}

function emptyDraft(): Draft {
  const today = new Date().toISOString().slice(0, 10)
  return {
    title: "",
    date: today,
    summary: "",
    body: "",
    published: true,
  }
}

function fromPost(post: NewsPost): Draft {
  return {
    title: post.title,
    date: post.date,
    summary: post.summary,
    body: post.body,
    published: post.published,
  }
}

export function AdminNewsPanel() {
  const confirm = useConfirm()
  const [posts, setPosts] = useState<NewsPost[]>([])
  const [selectedId, setSelectedId] = useState<number | "new" | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api("admin/news")
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { posts?: NewsPost[] }
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setPosts(json.data?.posts ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load news")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const selectNew = () => {
    setSelectedId("new")
    setDraft(emptyDraft())
    setOk(null)
    setError(null)
  }

  const selectPost = (post: NewsPost) => {
    setSelectedId(post.id)
    setDraft(fromPost(post))
    setOk(null)
    setError(null)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    setOk(null)
    try {
      const payload = {
        title: draft.title,
        date: draft.date,
        summary: draft.summary,
        body: draft.body,
        published: draft.published,
      }
      const response =
        selectedId === "new"
          ? await api.post("admin/news", { json: payload })
          : await api.put(`admin/news/${selectedId}`, { json: payload })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { post?: NewsPost }
      }
      if (!response.ok || !json.success || !json.data?.post) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      const post = json.data.post
      setOk(selectedId === "new" ? "Created" : "Saved")
      setSelectedId(post.id)
      setDraft(fromPost(post))
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (selectedId == null || selectedId === "new") return
    const ok = await confirm({
      title: "Delete this news post?",
      description: `Post #${selectedId} will be removed permanently.`,
      confirmLabel: "Delete",
      variant: "destructive",
    })
    if (!ok) return
    setSaving(true)
    setError(null)
    setOk(null)
    try {
      const response = await api.delete(`admin/news/${selectedId}`)
      const json = (await response.json()) as {
        success?: boolean
        message?: string
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setSelectedId(null)
      setDraft(emptyDraft())
      setOk("Deleted")
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed")
    } finally {
      setSaving(false)
    }
  }

  const editing = selectedId != null

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
      <aside className="border border-border/80 bg-muted/20">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Posts
          </span>
          <Button type="button" size="sm" variant="outline" onClick={selectNew}>
            New
          </Button>
        </div>
        {loading ? (
          <p className="p-3 text-xs text-muted-foreground">Loading…</p>
        ) : posts.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">No posts yet.</p>
        ) : (
          <ul className="max-h-[28rem] overflow-y-auto">
            {posts.map((post) => (
              <li key={post.id}>
                <button
                  type="button"
                  className={`w-full border-b border-border/60 px-3 py-2 text-left text-xs hover:bg-muted/40 ${
                    selectedId === post.id ? "bg-muted/50" : ""
                  }`}
                  onClick={() => selectPost(post)}
                >
                  <span className="block font-medium text-foreground">
                    {post.title}
                  </span>
                  <span className="text-muted-foreground">
                    #{post.id} · {post.date}
                    {!post.published ? " · draft" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="space-y-3">
        {error ? <FormAlert variant="error">{error}</FormAlert> : null}
        {ok ? <FormAlert variant="success">{ok}</FormAlert> : null}

        {!editing ? (
          <p className="text-sm text-muted-foreground">
            Select a post or create a new one. Body is Markdown.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">Title</span>
                <Input
                  value={draft.title}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, title: e.target.value }))
                  }
                  disabled={saving}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">Date</span>
                <Input
                  type="date"
                  value={draft.date}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, date: e.target.value }))
                  }
                  disabled={saving}
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Summary</span>
              <Input
                value={draft.summary}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, summary: e.target.value }))
                }
                disabled={saving}
              />
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={draft.published}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, published: e.target.checked }))
                }
                disabled={saving}
              />
              <span className="text-muted-foreground">
                Published (visible on /news)
              </span>
            </label>

            <div className="grid gap-3 lg:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">Body (Markdown)</span>
                <textarea
                  className="min-h-[16rem] border border-border bg-muted/30 px-2 py-1.5 font-mono text-xs text-foreground"
                  value={draft.body}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, body: e.target.value }))
                  }
                  disabled={saving}
                  spellCheck
                />
              </label>
              <div className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">Preview</span>
                <div className="min-h-[16rem] border border-border/80 bg-muted/20 px-3 py-2">
                  {draft.body.trim() ? (
                    <NewsMarkdown source={draft.body} />
                  ) : (
                    <p className="text-muted-foreground">Nothing to preview.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? "Saving…" : selectedId === "new" ? "Create" : "Save"}
              </Button>
              {selectedId !== "new" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={saving}
                  onClick={() => void remove()}
                >
                  Delete
                </Button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
