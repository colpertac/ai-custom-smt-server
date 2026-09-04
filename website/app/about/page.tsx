import type { Metadata } from "next"

import { NewsMarkdown } from "@/components/news-markdown"
import { getAboutMarkdown } from "@/lib/site-settings-store"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "About",
}

export default function AboutPage() {
  const source = getAboutMarkdown()

  return (
    <article className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-heading text-3xl font-semibold tracking-[0.12em] uppercase">
        About
      </h1>
      <div className="gold-rule mt-3 max-w-xs" />
      <div className="mt-6">
        <NewsMarkdown source={source} />
      </div>
    </article>
  )
}
