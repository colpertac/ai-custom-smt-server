import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { NewsMarkdown } from "@/components/news-markdown"
import { getNewsPostById } from "@/lib/news-store"

type Props = { params: Promise<{ id: string }> }

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id: raw } = await params
  const id = Number.parseInt(raw, 10)
  if (!Number.isFinite(id) || id <= 0) return { title: "News" }
  const post = getNewsPostById(id)
  return { title: post?.title ?? "News" }
}

export default async function NewsPostPage({ params }: Props) {
  const { id: raw } = await params
  const id = Number.parseInt(raw, 10)
  if (!Number.isFinite(id) || id <= 0) notFound()
  const post = getNewsPostById(id)
  if (!post) notFound()

  return (
    <article className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs tracking-wide text-muted-foreground">
        <Link href="/news" className="hover:text-gold-dim">
          News
        </Link>
        <span className="mx-2 text-border">/</span>
        {post.date}
      </p>
      <h1 className="font-heading mt-3 text-3xl font-semibold tracking-[0.08em]">
        {post.title}
      </h1>
      <div className="gold-rule mt-4 max-w-sm" />
      <div className="mt-6">
        <NewsMarkdown source={post.body} />
      </div>
    </article>
  )
}
