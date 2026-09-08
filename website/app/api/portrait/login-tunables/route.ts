import { apiFail, apiOk } from "@/lib/api-response"
import { requirePortraitWorker } from "@/lib/portrait-worker-auth"
import {
  getStudioLoginTunables,
  studioLoginTunablesToEnv,
} from "@/lib/studio-login-tunables"

/** Wine host pulls tunables before orch/login. */
export async function GET(request: Request) {
  const denied = requirePortraitWorker(request)
  if (denied) return denied

  const tunables = getStudioLoginTunables()
  return apiOk({
    tunables,
    env: studioLoginTunablesToEnv(tunables),
  })
}
