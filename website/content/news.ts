export type NewsPost = {
  slug: string
  title: string
  date: string
  summary: string
  body: string[]
}

/**
 * Seed-only source for first boot of `news_posts` in web.sqlite.
 * Runtime reads go through `@/lib/news-store`.
 */
export const newsPosts: NewsPost[] = [
  {
    slug: "hello-world",
    title: "Hello world",
    date: "2026-01-01",
    summary: "Welcome to your new realm.",
    body: ["Hello world."],
  },
]

export function getNewsPost(slug: string): NewsPost | undefined {
  return newsPosts.find((p) => p.slug === slug)
}
