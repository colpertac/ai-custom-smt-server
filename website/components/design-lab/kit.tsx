import Link from "next/link"

import { cn } from "@/lib/utils"

export const DESIGN_VARIANTS = [
  {
    href: "/test1",
    id: "1",
    name: "Stage",
    blurb: "Gold/slate centered stage — closest to live site",
  },
  {
    href: "/test2",
    id: "2",
    name: "NewOrder frame",
    blurb: "Fixed width, left rail, official-era chrome",
  },
  {
    href: "/test3",
    id: "3",
    name: "Forum denser",
    blurb: "Board-style home: news rows + status strip",
  },
  {
    href: "/test4",
    id: "4",
    name: "Banner private-server (Current)",
    blurb: "Full-bleed banner hero, ChromieCraft-ish polish",
  },
  {
    href: "/test5",
    id: "5",
    name: "COMP terminal",
    blurb: "Monospace / utilitarian terminal console",
  },
  {
    href: "/test6",
    id: "6",
    name: "Gamer portal",
    blurb: "Half modern, half functional — simple account, no deep menus",
  },
] as const

/** Escape the live portal chrome so variants own the viewport. */
export function LabViewport({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] overflow-y-auto bg-[#05070b] text-[#ced3e0]",
        className
      )}
    >
      {children}
    </div>
  )
}

export function VariantSwitcher({ active }: { active: string }) {
  return (
    <div className="sticky top-0 z-20 border-b border-[#334155] bg-[#0a0c10]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-3 py-2 text-[0.7rem] tracking-wide uppercase">
        <Link
          href="/test"
          className="mr-2 font-semibold text-[#d3b800] no-underline hover:text-[#f0d24a]"
        >
          Lab
        </Link>
        {DESIGN_VARIANTS.map((v) => (
          <Link
            key={v.href}
            href={v.href}
            className={cn(
              "border px-2 py-0.5 no-underline transition-colors",
              active === v.id
                ? "border-[#d3b800] bg-[#d3b800]/15 text-[#f0d24a]"
                : "border-[#334155] text-[#8b93a7] hover:border-[#cc9d00] hover:text-[#ced3e0]"
            )}
          >
            {v.id}. {v.name}
          </Link>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <Link
            href={`/test${active || "1"}/account`}
            className="text-[#8b93a7] no-underline hover:text-[#cc9d00]"
          >
            Account UIs
          </Link>
          <Link
            href="/"
            className="text-[#8b93a7] no-underline hover:text-[#cc9d00]"
          >
            ← Live site
          </Link>
        </div>
      </div>
    </div>
  )
}

/** Non-functional control for mockups. */
export function StubButton({
  children,
  variant = "primary",
  className,
  title = "Stub — not wired",
}: {
  children: React.ReactNode
  variant?: "primary" | "outline" | "ghost" | "danger"
  className?: string
  title?: string
}) {
  const styles = {
    primary: "border-[#cc9d00] bg-[#d3b800] text-[#0a0c10] hover:bg-[#f0d24a]",
    outline:
      "border-[#334155] bg-transparent text-[#ced3e0] hover:border-[#cc9d00]",
    ghost:
      "border-transparent bg-transparent text-[#8b93a7] hover:text-[#d3b800]",
    danger: "border-[#911] bg-[#3a1010] text-[#ffc9c9] hover:border-[#e05555]",
  }[variant]

  return (
    <button
      type="button"
      title={title}
      className={cn(
        "inline-flex cursor-default items-center justify-center border px-3 py-2 text-xs font-semibold tracking-[0.12em] uppercase transition-colors",
        styles,
        className
      )}
    >
      {children}
    </button>
  )
}

export function StubLink({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      title="Stub — not wired"
      className={cn(
        "cursor-default text-[#ced3e0] underline-offset-2 hover:text-[#cc9d00] hover:underline",
        className
      )}
    >
      {children}
    </span>
  )
}
