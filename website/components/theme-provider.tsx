"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

import { DEFAULT_SKIN, SKIN_IDS } from "@/lib/skins"

function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="data-skin"
      defaultTheme={DEFAULT_SKIN}
      themes={[...SKIN_IDS]}
      enableSystem={false}
      storageKey="imagine-skin"
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}

export { ThemeProvider }
