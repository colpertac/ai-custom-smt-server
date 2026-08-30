import type { Metadata } from "next"
import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Not found",
}

export default function NotFound() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-16">
      <p className="text-[0.7rem] tracking-[0.4em] text-gold uppercase">
        Error 404
      </p>
      <h1 className="mt-3 font-heading text-4xl leading-tight tracking-[0.08em] text-white uppercase sm:text-5xl">
        Terminal not found
      </h1>
      <div className="gold-rule mt-4 max-w-xs" />
      <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
        That page does not exist on this realm — the link may be wrong or
        something was removed.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/"
          className={cn(
            buttonVariants({ size: "lg" }),
            "uppercase tracking-[0.14em]"
          )}
        >
          Return home
        </Link>
        <Link
          href="/armory"
          className={cn(
            buttonVariants({ size: "lg", variant: "outline" }),
            "uppercase tracking-[0.14em]"
          )}
        >
          Armory
        </Link>
        <Link
          href="/news"
          className={cn(
            buttonVariants({ size: "lg", variant: "ghost" }),
            "uppercase tracking-[0.14em] text-nav-muted"
          )}
        >
          News
        </Link>
      </div>
    </section>
  )
}
