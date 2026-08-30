import Link from "next/link"

export function SiteFooter() {
  return (
    <footer className="border-t border-chrome-border bg-background py-(--density-footer-y) text-center text-[0.7rem] tracking-wide text-footer-muted">
      <p>
        Unofficial private server fan project. Not affiliated with Atlus, Sega,
        or the original IMAGINE operators.
      </p>
      <p className="mt-2">
        <Link href="/status" className="text-muted-foreground hover:text-gold-dim">
          Server status
        </Link>
        <span className="mx-2 text-faint">·</span>
        <Link href="/armory" className="text-muted-foreground hover:text-gold-dim">
          Armory
        </Link>
        <span className="mx-2 text-faint">·</span>
        <Link href="/download" className="text-muted-foreground hover:text-gold-dim">
          Client setup
        </Link>
      </p>
    </footer>
  )
}
