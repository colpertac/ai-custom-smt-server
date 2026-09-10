import { apiOk } from "@/lib/api-response"
import { collectPlayerPresence } from "@/lib/player-presence"
import { collectStatus } from "@/lib/status"

export async function GET() {
  const [services, players] = await Promise.all([
    collectStatus(),
    collectPlayerPresence(),
  ])
  return apiOk({ services, players })
}
