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
    slug: "oracle-smoke",
    title: "Public test realm online",
    date: "2026-07-24",
    summary:
      "Oracle VPS smoke passed — updater, lobby, and channel reachable from outside the LAN.",
    body: [
      "The private IMAGINE stack is reachable on the Oracle test instance: website, overlay updater, lobby, and channel.",
      "Use the Download page for updater BaseURL / VersionData host notes. Report bugs on the usual channel.",
      "HTTPS and automated backups are still on the hardening checklist.",
    ],
  },
  {
    slug: "welcome",
    title: "Welcome to the account portal",
    date: "2026-07-20",
    summary: "Register and manage accounts through the Phase 7 website BFF.",
    body: [
      "Create an account here, then launch with VersionData pointed at this realm.",
      "Lobby HTTP (10999) stays private — the browser only talks to this site.",
    ],
  },
]

export function getNewsPost(slug: string): NewsPost | undefined {
  return newsPosts.find((p) => p.slug === slug)
}
