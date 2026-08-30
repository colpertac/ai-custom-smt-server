import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { newsPosts } from "@/content/news"
import { cn } from "@/lib/utils"
import { readSession } from "@/lib/session"

export default async function HomePage() {
  const session = await readSession()
  const latest = newsPosts.slice(0, 3)

  return (
    <>
      <section
        className="relative flex min-h-[22rem] items-end border-b border-[#2a2a2a] sm:min-h-[28rem]"
        style={{
          background:
            "linear-gradient(180deg, transparent 30%, #0e0e0e 100%), radial-gradient(ellipse at 60% 30%, #2a3a55 0%, transparent 50%), linear-gradient(135deg, #1a1520 0%, #0e0e0e 45%, #162032 100%)",
        }}
      >
        <div className="relative mx-auto w-full max-w-5xl px-4 py-10">
          <p className="text-[0.7rem] tracking-[0.4em] text-gold uppercase">
            Private realm
          </p>
          <h1 className="mt-3 max-w-xl font-heading text-4xl leading-tight tracking-[0.08em] text-white uppercase sm:text-5xl">
            Return to Tokyo
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-[#b0b6c4] sm:text-base">
            Account portal, updater, and status for a Shin Megami Tensei:
            IMAGINE private server — built for players who still remember the
            COMP.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {session ? (
              <Link
                href="/account"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "uppercase tracking-[0.14em]"
                )}
              >
                Open account
              </Link>
            ) : (
              <Link
                href="/register"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "uppercase tracking-[0.14em]"
                )}
              >
                Create account
              </Link>
            )}
            <Link
              href="/download"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "uppercase tracking-[0.14em]"
              )}
            >
              Download client
            </Link>
            {!session ? (
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ size: "lg", variant: "ghost" }),
                  "uppercase tracking-[0.14em] text-[#aaa]"
                )}
              >
                Sign in
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-px border-b border-[#2a2a2a] bg-[#2a2a2a] sm:grid-cols-3">
        {(
          [
            {
              t: "Account",
              d: "Register, manage password, and keep your characters on this realm.",
              href: session ? "/account" : "/register",
              link: session ? "Open account →" : "Create account →",
            },
            {
              t: "Updater",
              d: "Point ImagineUpdate at our BaseURL — hashlist served from the host.",
              href: "/download",
              link: "Setup guide →",
            },
            {
              t: "Status",
              d: "Lobby and channel probes from the website BFF. World stays internal.",
              href: "/status",
              link: "Live status →",
            },
          ] as const
        ).map((f) => (
          <div key={f.t} className="bg-[#141414] px-5 py-6">
            <h2 className="font-heading text-sm tracking-[0.2em] text-gold uppercase">
              {f.t}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {f.d}
            </p>
            <Link
              href={f.href}
              className="mt-3 inline-block text-xs text-foreground hover:text-gold-dim"
            >
              {f.link}
            </Link>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex items-end justify-between gap-4 border-b border-[#2a2a2a] pb-3">
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
              key={post.slug}
              className="flex flex-wrap items-baseline gap-3 text-sm"
            >
              <span className="font-mono text-xs text-[#666]">{post.date}</span>
              <Link
                href={`/news/${post.slug}`}
                className="text-foreground hover:text-gold-dim"
              >
                {post.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
