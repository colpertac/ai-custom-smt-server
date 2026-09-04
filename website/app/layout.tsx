import type { Metadata } from "next"
import { Cinzel, IBM_Plex_Mono, Source_Sans_3 } from "next/font/google"

import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { Providers } from "@/app/providers"
import { getServerUser } from "@/features/auth/server"
import { getWebsiteBranding } from "@/lib/site-settings-store"
import { cn } from "@/lib/utils"

import "./globals.css"

const heading = Cinzel({
  subsets: ["latin"],
  variable: "--font-heading-face",
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

export async function generateMetadata(): Promise<Metadata> {
  const branding = getWebsiteBranding()
  const titleName = branding.siteName
  return {
    title: {
      default: titleName,
      template: `%s · ${titleName}`,
    },
    description: "Private Shin Megami Tensei: IMAGINE server",
    ...(branding.iconUrl
      ? {
          icons: {
            icon: branding.iconUrl,
            apple: branding.iconUrl,
          },
        }
      : {}),
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const initialSession = await getServerUser()

  return (
    <html
      lang="en"
      className={cn("dark", heading.variable, body.variable, mono.variable)}
      suppressHydrationWarning
    >
      <body className="min-h-svh bg-background text-foreground antialiased">
        <Providers initialSession={initialSession}>
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
