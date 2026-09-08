import { apiFail, apiOk } from "@/lib/api-response"
import { requirePortraitWorker } from "@/lib/portrait-worker-auth"
import { saveStudioDebugScreenshot } from "@/lib/studio-debug-screenshots"

/** Wine host uploads orch/login window snaps. */
export async function POST(request: Request) {
  const denied = requirePortraitWorker(request)
  if (denied) return denied

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return apiFail("Expected multipart form data", 400, "BAD_REQUEST")
  }

  const role = String(form.get("role") ?? "")
  const step = String(form.get("step") ?? "")
  const file = form.get("file")
  if (
    file == null ||
    typeof file === "string" ||
    typeof (file as Blob).arrayBuffer !== "function"
  ) {
    return apiFail("file is required", 400, "VALIDATION")
  }

  const buf = Buffer.from(await (file as Blob).arrayBuffer())
  try {
    const meta = saveStudioDebugScreenshot({ role, step, bytes: buf })
    return apiOk({ screenshot: meta }, "Debug screenshot saved")
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Failed to save screenshot",
      400,
      "VALIDATION"
    )
  }
}
