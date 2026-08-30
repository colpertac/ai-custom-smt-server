import Link from "next/link"

export function SiteFooter() {
  return (
    <footer className="border-t border-[#2a2a2a] bg-[#0e0e0e] py-6 text-center text-[0.7rem] tracking-wide text-[#555]">
      <p>
        Unofficial private server fan project. Not affiliated with Atlus, Sega,
        or the original IMAGINE operators.
      </p>
      <p className="mt-2">
        <Link href="/status" className="text-[#8b93a7] hover:text-gold-dim">
          Server status
        </Link>
        <span className="mx-2 text-[#333]">·</span>
        <Link href="/download" className="text-[#8b93a7] hover:text-gold-dim">
          Client setup
        </Link>
      </p>
    </footer>
  )
}
