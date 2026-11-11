import type { WikiValuable } from "@/content/wiki/types"
import { WikiBreadcrumb } from "@/features/wiki/components/WikiShell"
import { WIKI_VALUABLES_META } from "@/features/wiki/wiki-nav"

export function WikiValuableDetailView({
  valuable,
}: {
  valuable: WikiValuable
}) {
  return (
    <div className="space-y-3">
      <WikiBreadcrumb
        segments={[
          { label: "Item wiki", href: "/wiki" },
          { label: WIKI_VALUABLES_META.title, href: WIKI_VALUABLES_META.href },
          { label: valuable.name || `Valuable ${valuable.id}` },
        ]}
      />

      <article className="border border-border bg-card/40">
        <header className="border-b border-border px-3 py-2.5 sm:px-4">
          <h1 className="font-heading text-xl tracking-wide uppercase leading-tight">
            {valuable.name || `Valuable ${valuable.id}`}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
            <span className="font-mono text-xs">#{valuable.id}</span>
            {valuable.hidden ? (
              <>
                <span aria-hidden>·</span>
                <span className="text-amber-400/90">Hidden</span>
              </>
            ) : null}
            <span aria-hidden>·</span>
            <span>Sort {valuable.sortOrder}</span>
          </p>
        </header>

        <div className="space-y-4 p-3 sm:p-4">
          <section>
            <h2 className="font-heading text-xs font-semibold tracking-[0.12em] uppercase text-gold-dim">
              Description
            </h2>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-snug text-foreground/90">
              {valuable.description || "No in-game description on record."}
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xs font-semibold tracking-[0.12em] uppercase text-gold-dim">
              GM command
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Grant with{" "}
              <code className="text-foreground">@valuable {valuable.id}</code>
              . Remove with{" "}
              <code className="text-foreground">
                @valuable {valuable.id} remove
              </code>
              .
            </p>
          </section>
        </div>
      </article>
    </div>
  )
}
