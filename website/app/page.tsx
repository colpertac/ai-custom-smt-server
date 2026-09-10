import Link from "next/link"

import { NewsMarkdown } from "@/components/news-markdown"
import { buttonVariants } from "@/components/ui/button"
import { PlayerPresenceStats } from "@/features/status/components/PlayerPresenceStats"
import { listPublishedNews } from "@/lib/news-store"
import { getAboutMarkdown } from "@/lib/site-settings-store"
import { cn } from "@/lib/utils"
import { readSession } from "@/lib/session"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const session = await readSession()
  const latest = listPublishedNews().slice(0, 3)
  const about = getAboutMarkdown()

  return (
    <>
      <section
        className="relative flex min-h-(--density-hero-min) items-end border-b border-chrome-border sm:min-h-(--density-hero-min-sm)"
        style={{ background: "var(--hero-bg)" }}
      >
        <div className="relative mx-auto w-full max-w-5xl px-4 py-(--density-section-y)">
          <p className="text-[0.7rem] tracking-[0.4em] text-gold uppercase">
            Private realm
          </p>
          <h1 className="mt-3 max-w-xl font-heading text-4xl leading-tight tracking-[0.08em] text-white uppercase sm:text-5xl">
            Return to Tokyo
          </h1>
          <p
            className="mt-4 max-w-md leading-relaxed text-hero-lead sm:text-base"
            style={{ fontSize: "var(--density-lead)" }}
          >
            Account portal, updater, and status for a Shin Megami Tensei:
            IMAGINE private server — built for players who still remember the
            COMP.
          </p>
          <div
            className="flex flex-wrap gap-3"
            style={{ marginTop: "var(--density-stack)" }}
          >
            {session ? (
              <Link
                href="/account"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "uppercase tracking-[var(--density-nav-tracking)]"
                )}
              >
                Open account
              </Link>
            ) : (
              <Link
                href="/register"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "uppercase tracking-[var(--density-nav-tracking)]"
                )}
              >
                Create account
              </Link>
            )}
            <Link
              href="/download"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "uppercase tracking-[var(--density-nav-tracking)]"
              )}
            >
              Download client
            </Link>
            {!session ? (
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ size: "lg", variant: "ghost" }),
                  "uppercase tracking-[var(--density-nav-tracking)] text-nav-muted"
                )}
              >
                Sign in
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid w-full gap-px border-b border-chrome-border bg-panel-rule sm:grid-cols-3">
        <div className="bg-panel px-(--density-panel-x) py-(--density-panel-y) sm:px-8">
          <h2 className="font-heading text-sm tracking-[0.2em] text-gold uppercase">
            Account
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Register, manage password, and keep your characters on this realm.
          </p>
          <Link
            href={session ? "/account" : "/register"}
            className="mt-3 inline-block text-xs text-foreground hover:text-gold-dim"
          >
            {session ? "Open account →" : "Create account →"}
          </Link>
        </div>

        <div className="bg-panel px-(--density-panel-x) py-(--density-panel-y) sm:px-8">
          <h2 className="font-heading text-sm tracking-[0.2em] text-gold uppercase">
            Updater
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Download the client, then run the updater so patches stay current.
          </p>
          <Link
            href="/download"
            className="mt-3 inline-block text-xs text-foreground hover:text-gold-dim"
          >
            Setup guide →
          </Link>
        </div>

        <div className="flex flex-col bg-panel px-(--density-panel-x) py-(--density-panel-y) sm:px-8">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-heading text-sm tracking-[0.2em] text-gold uppercase">
              Players
            </h2>
            <Link
              href="/status"
              className="text-[0.65rem] tracking-wide text-muted-foreground uppercase hover:text-gold-dim"
            >
              Status →
            </Link>
          </div>
          <PlayerPresenceStats className="mt-3 flex-1" panel />
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 py-(--density-section-y)">
        <div className="flex items-end justify-between gap-4 border-b border-chrome-border pb-3">
          <h2 className="font-heading text-xl tracking-[0.15em] uppercase">
            Latest news
          </h2>
          <Link
            href="/news"
            className="text-xs text-muted-foreground hover:text-gold-dim"
          >
            All posts
          </Link>
        </div>
        <ul className="mt-4 space-y-4">
          {latest.map((post) => (
            <li
              key={post.id}
              className="flex flex-wrap items-baseline gap-3 text-sm"
            >
              <span className="font-mono text-xs text-faint">{post.date}</span>
              <Link
                href={`/news/${post.id}`}
                className="text-foreground hover:text-gold-dim"
              >
                {post.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="about"
        className="mx-auto w-full max-w-5xl border-t border-chrome-border px-4 py-(--density-section-y)"
      >
        <div className="flex items-end justify-between gap-4 border-b border-chrome-border pb-3">
          <h2 className="font-heading text-xl tracking-[0.15em] uppercase">
            About
          </h2>
          <Link
            href="/about"
            className="text-xs text-muted-foreground hover:text-gold-dim"
          >
            Full page
          </Link>
        </div>
        <div className="mt-4 max-w-2xl">
          <NewsMarkdown source={about} />
        </div>
      </section>
    </>
  )
}
