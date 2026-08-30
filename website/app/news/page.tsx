import type { Metadata } from "next"
import Link from "next/link"

import { listPublishedNews } from "@/lib/news-store"

export const metadata: Metadata = {
  title: "News",
}

export const dynamic = "force-dynamic"

export default function NewsPage() {
  const posts = listPublishedNews()

  return (
    <section className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-heading text-3xl font-semibold tracking-[0.12em] uppercase">
        News
      </h1>
      <div className="gold-rule mt-3 max-w-xs" />
      <p className="mt-4 text-sm text-muted-foreground">
        Realm notices for this private server.
      </p>
      {posts.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">No news yet.</p>
      ) : (
        <ul className="mt-8 space-y-4">
          {posts.map((post) => (
            <li key={post.id}>
              <Link
                href={`/news/${post.id}`}
                className="group block border border-border bg-muted/40 p-4 no-underline outline-none transition-colors hover:border-gold-dim"
              >
                <p className="text-xs tracking-wide text-muted-foreground">
                  {post.date}
                </p>
                <h2 className="font-heading mt-1 text-xl font-semibold tracking-wide text-foreground group-hover:text-gold-hot">
                  {post.title}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {post.summary}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
