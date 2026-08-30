import type { Metadata } from "next"
import { Cinzel, IBM_Plex_Mono, Source_Sans_3 } from "next/font/google"

import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { Providers } from "@/app/providers"
import { cn } from "@/lib/utils"

import "./globals.css"

const heading = Cinzel({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["400", "600", "700"],
})

const body = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "600", "700"],
})

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono-face",
  weight: ["400", "500"],
})

export const metadata: Metadata = {
  title: {
    default: "IMAGINE",
    template: "%s · IMAGINE",
  },
  description: "Private Shin Megami Tensei: IMAGINE server",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={cn("dark", heading.variable, body.variable, mono.variable)}
      suppressHydrationWarning
    >
      <body className="min-h-svh bg-[#0e0e0e] text-foreground antialiased">
        <Providers>
          <div className="flex min-h-svh flex-col">
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </div>
        </Providers>
      </body>
    </html>
  )
}
