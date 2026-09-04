import { apiOk } from "@/lib/api-response"
import { getWebsiteBranding } from "@/lib/site-settings-store"

export const dynamic = "force-dynamic"

export async function GET() {
  const branding = getWebsiteBranding()
  return apiOk({
    siteName: branding.siteName,
    iconUrl: branding.iconUrl,
    hasCustomIcon: branding.hasCustomIcon,
  })
}
