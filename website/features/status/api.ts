import { fetcher } from "@/lib/fetcher"
import type { ServiceStatus } from "@/lib/status"

export type StatusPayload = { services: ServiceStatus[] }

export const fetchStatus = () => fetcher<StatusPayload>("status")
