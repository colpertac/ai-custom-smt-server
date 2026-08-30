import Link from "next/link"

import { cn } from "@/lib/utils"
import {
  DESIGN_VARIANTS,
  LabViewport,
  StubButton,
  VariantSwitcher,
} from "@/components/design-lab/kit"

/** Fake account row for all account lab mockups. */
export const STUB_ACCOUNT = {
  username: "admin",
  email: "admin@comp_hack.github.com",
  cp: 999976,
  tickets: 0,
  characters: 0,
  userLevel: 1000,
  enabled: true,
  lastLogin: "7/24/2026, 4:26:42 AM",
  charactersList: [
    { name: "(none yet)", level: "—", class: "—", zone: "—" },
  ],
} as const

export const ACCOUNT_NAV = [
  { id: "overview", label: "Overview" },
  { id: "credentials", label: "Credentials" },
  { id: "characters", label: "Characters" },
  { id: "security", label: "Security" },
  { id: "sessions", label: "Sessions" },
  { id: "admin", label: "Admin tools" },
] as const

export function AccountLabChrome({
  activeVariant,
  children,
  className,
}: {
  activeVariant: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <LabViewport className={className}>
      <VariantSwitcher active={activeVariant} />
      <div className="border-b border-[#334155] bg-[#0c1018] px-3 py-1.5">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-2 text-[0.65rem] tracking-wide uppercase">
          <span className="text-[#8b93a7]">Account mockups:</span>
          {DESIGN_VARIANTS.map((v) => (
            <Link
              key={v.id}
              href={`/test${v.id}/account`}
              className={cn(
                "border px-2 py-0.5 no-underline",
                activeVariant === v.id
                  ? "border-[#d3b800] text-[#f0d24a]"
                  : "border-transparent text-[#8b93a7] hover:text-[#ced3e0]"
              )}
            >
              test{v.id}/account
            </Link>
          ))}
          <Link
            href={`/test${activeVariant}`}
            className="ml-auto text-[#8b93a7] no-underline hover:text-[#cc9d00]"
          >
            ← Variant home
          </Link>
        </div>
      </div>
      {children}
    </LabViewport>
  )
}

export function StubField({
  label,
  defaultValue = "",
  type = "text",
  hint,
  className,
}: {
  label: string
  defaultValue?: string
  type?: string
  hint?: string
  className?: string
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-0.5 block text-[0.65rem] tracking-wide text-[#8b93a7] uppercase">
        {label}
      </span>
      <input
        type={type}
        defaultValue={defaultValue}
        disabled
        title="Stub — not wired"
        className="h-7 w-full cursor-not-allowed border border-[#334155] bg-[#0a0c10] px-2 text-xs text-[#ced3e0] outline-none"
      />
      {hint ? (
        <span className="mt-0.5 block text-[0.65rem] text-[#666]">
          {hint}
        </span>
      ) : null}
    </label>
  )
}

export function PropRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 border-b border-[#1e293e] py-1.5 text-xs last:border-0">
      <dt className="text-[#8b93a7]">{label}</dt>
      <dd
        className={cn(
          "break-all text-[#e8ecf4]",
          mono && "font-mono text-[0.7rem]"
        )}
      >
        {value}
      </dd>
    </div>
  )
}

export function ToolSidebar({
  active = "overview",
  accent = "#d3b800",
}: {
  active?: string
  accent?: string
}) {
  return (
    <aside className="flex w-48 shrink-0 flex-col border-r border-[#2a3344] bg-[#0c1018]">
      <div className="border-b border-[#2a3344] px-3 py-2">
        <p className="truncate font-mono text-[0.65rem] text-[#8b93a7]">
          @{STUB_ACCOUNT.username}
        </p>
        <p className="truncate text-xs font-semibold text-[#e8ecf4]">
          Account studio
        </p>
      </div>
      <nav className="flex-1 py-1">
        {ACCOUNT_NAV.map((item) => {
          const on = item.id === active
          return (
            <button
              key={item.id}
              type="button"
              title="Stub — not wired"
              className={cn(
                "flex w-full cursor-default items-center gap-2 border-l-2 px-3 py-1.5 text-left text-xs",
                on
                  ? "bg-[#161c28] text-[#e8ecf4]"
                  : "border-transparent text-[#8b93a7] hover:bg-[#121824] hover:text-[#ced3e0]"
              )}
              style={on ? { borderLeftColor: accent } : undefined}
            >
              {item.label}
            </button>
          )
        })}
      </nav>
      <div className="space-y-1 border-t border-[#2a3344] p-2">
        <StubButton variant="outline" className="w-full py-1.5 text-[0.65rem]">
          Log out
        </StubButton>
      </div>
    </aside>
  )
}

export function MetricChip({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="border border-[#2a3344] bg-[#121824] px-3 py-2">
      <p className="text-[0.6rem] tracking-wider text-[#8b93a7] uppercase">
        {label}
      </p>
      <p
        className="mt-0.5 font-mono text-sm font-semibold tabular-nums"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
    </div>
  )
}
