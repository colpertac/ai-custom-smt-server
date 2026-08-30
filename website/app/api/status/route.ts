import { apiOk } from "@/lib/api-response"
import { collectStatus } from "@/lib/status"

export async function GET() {
  const services = await collectStatus()
  return apiOk({ services })
}
