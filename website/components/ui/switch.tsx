"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

const SIZES = {
  sm: {
    root: "h-5 w-9 p-0.5",
    thumb:
      "size-4 data-checked:translate-x-4 data-[checked]:translate-x-4 group-data-checked/switch:translate-x-4 data-unchecked:translate-x-0 data-[unchecked]:translate-x-0 group-data-unchecked/switch:translate-x-0",
  },
  default: {
    root: "h-6 w-11 p-0.5",
    thumb:
      "size-5 data-checked:translate-x-5 data-[checked]:translate-x-5 group-data-checked/switch:translate-x-5 data-unchecked:translate-x-0 data-[unchecked]:translate-x-0 group-data-unchecked/switch:translate-x-0",
  },
  lg: {
    root: "h-7 w-12 p-0.5",
    thumb:
      "size-6 data-checked:translate-x-5 data-[checked]:translate-x-5 group-data-checked/switch:translate-x-5 data-unchecked:translate-x-0 data-[unchecked]:translate-x-0 group-data-unchecked/switch:translate-x-0",
  },
} as const

function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default" | "lg"
}) {
  const sizeConfig = SIZES[size] ?? SIZES.default

  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full border transition-all duration-200 outline-none select-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        sizeConfig.root,
        // Unchecked track: distinctly visible, recessed pill with border & dark fill
        "data-unchecked:bg-zinc-800 data-unchecked:border-zinc-600/80 data-[unchecked]:bg-zinc-800 data-[unchecked]:border-zinc-600/80 hover:data-unchecked:border-zinc-400 hover:data-unchecked:bg-zinc-750 shadow-inner",
        // Checked track: vibrant primary/gold with matching border and soft glow
        "data-checked:bg-primary data-checked:border-primary data-[checked]:bg-primary data-[checked]:border-primary shadow-xs data-checked:shadow-primary/40 hover:data-checked:brightness-105",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out",
          sizeConfig.thumb
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
