"use client"

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const toggleVariants = cva(
  "group/toggle inline-flex shrink-0 items-center justify-center gap-1.5 rounded-none border border-transparent bg-clip-padding font-semibold whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default:
          "border-border bg-muted/40 text-foreground hover:border-gold-dim hover:text-gold-hot data-pressed:border-gold-dim data-pressed:bg-muted data-pressed:text-gold-hot",
        outline:
          "border-border bg-transparent text-foreground hover:border-gold-dim hover:bg-muted/40 hover:text-gold-hot data-pressed:border-gold-dim data-pressed:bg-muted/60 data-pressed:text-gold-hot",
      },
      size: {
        default:
          "h-(--density-control-h) px-(--density-control-px) text-(length:--density-control-text)/relaxed",
        sm: "h-(--density-control-h-sm) px-2.5 text-(length:--density-control-text)/relaxed",
        lg: "h-(--density-control-h-lg) px-(--density-control-px-lg) text-(length:--density-control-text-lg)/relaxed",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
