import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { getNewsPost, newsPosts } from "@/content/news"

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  return newsPosts.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = getNewsPost(slug)
  return { title: post?.title ?? "News" }
}

export default async function NewsPostPage({ params }: Props) {
  const { slug } = await params
  const post = getNewsPost(slug)
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
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-foreground/90">
        {post.body.map((para) => (
          <p key={para.slice(0, 24)}>{para}</p>
        ))}
      </div>
    </article>
  )
}
