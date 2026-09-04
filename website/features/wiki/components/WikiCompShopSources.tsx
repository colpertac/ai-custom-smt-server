import type { WikiCompShopListing } from "@/content/wiki"
import { cn } from "@/lib/utils"

function FlowBox({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "min-w-0 flex-1 border border-border/80 bg-card/50 px-3 py-2.5",
        className
      )}
    >
      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 text-sm font-medium leading-snug text-foreground">
        {children}
      </div>
    </div>
  )
}

function FlowArrow() {
  return (
    <div
      className="flex shrink-0 items-center self-center px-0.5 text-muted-foreground"
      aria-hidden
    >
      <span className="h-px w-3 bg-border sm:w-5" />
      <span className="border-y-[5px] border-l-[7px] border-y-transparent border-l-border" />
    </div>
  )
}

function CompShopFlowRow({ row }: { row: WikiCompShopListing }) {
  return (
    <li className="border border-border/70 bg-muted/10 p-2.5 sm:p-3">
      <div className="flex items-stretch gap-0">
        <FlowBox label="Shop">
          <p>{row.shopName}</p>
          <p className="mt-0.5 font-mono text-[0.65rem] font-normal text-muted-foreground">
            #{row.shopId}
          </p>
        </FlowBox>
        <FlowArrow />
        <FlowBox label="Tab">{row.tabName}</FlowBox>
      </div>
      <p className="mt-2.5 text-sm text-muted-foreground">
        Price:{" "}
        <span className="font-mono font-semibold text-gold-hot">
          {row.basePrice.toLocaleString()} {row.currency}
        </span>
      </p>
    </li>
  )
}

export function WikiCompShopSources({
  listings,
}: {
  listings: WikiCompShopListing[]
}) {
  if (listings.length === 0) return null

  return (
    <section className="border border-border bg-muted/20 p-3">
      <h2 className="font-heading text-xs font-semibold tracking-[0.12em] uppercase text-gold-dim">
        Where to get
      </h2>
      <p className="mt-1 text-[0.7rem] leading-snug text-muted-foreground">
        In-game shops on this server — not world NPC vendors, drops, or quests.
      </p>
      <ul className="mt-2.5 space-y-2">
        {listings.map((row) => (
          <CompShopFlowRow
            key={`${row.shopId}-${row.tabName}-${row.productId}`}
            row={row}
          />
        ))}
      </ul>
    </section>
  )
}
