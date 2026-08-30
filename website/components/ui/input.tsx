import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-(--density-control-h) w-full min-w-0 rounded-none border border-border bg-background/70 px-(--density-control-px) py-1 text-sm transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs/relaxed file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-gold-dim focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-[#e05555] aria-invalid:ring-2 aria-invalid:ring-[#e05555]/35 md:text-(length:--density-control-text)/relaxed",
        className
      )}
      {...props}
    />
  )
}

export { Input }
