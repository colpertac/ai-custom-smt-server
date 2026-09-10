import { fetcher } from "@/lib/fetcher"
import type { PlayerPresence } from "@/lib/player-presence"
import type { ServiceStatus } from "@/lib/status"

export type StatusPayload = {
  services: ServiceStatus[]
  players?: PlayerPresence
}

export const fetchStatus = () => fetcher<StatusPayload>("status")
