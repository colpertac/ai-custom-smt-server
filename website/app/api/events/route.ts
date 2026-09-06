import { apiFail, apiOk } from "@/lib/api-response"
import { getPublicEventsResponse } from "@/lib/events/event-schedule-fs"

export async function GET() {
  try {
    const data = await getPublicEventsResponse()
    return apiOk(data)
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to load events",
      500,
      "EVENTS"
    )
  }
}
