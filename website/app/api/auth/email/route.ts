import { changeEmail } from "@/lib/comp-api"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { displayEmail } from "@/lib/email"
import {
  CompSessionMissingError,
  requireWebSession,
  withCompSession,
} from "@/lib/web-session"
import { z } from "zod"

const schema = z.object({
  email: z
    .string()
    .trim()
    .transform((s) => s.toLowerCase())
    .refine(
      (s) => s === "" || z.string().email().safeParse(s).success,
      "Invalid email"
    ),
})

export async function POST(request: Request) {
  const blocked = await guardApiMutation("email", 10, 60_000)
  if (blocked) return blocked

  const gate = await requireWebSession()
  if (!gate) return apiFail("Unauthorized", 401, "UNAUTHORIZED")

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "BAD_REQUEST")
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  try {
    return await withCompSession(async (session) => {
      const result = await changeEmail(session, parsed.data.email)
      if (result.error !== "Success") {
        return apiFail(result.error, 400, "UPDATE")
      }
      return apiOk({
        email: displayEmail(parsed.data.email, session.username) || "",
      })
    })
  } catch (error) {
    if (error instanceof CompSessionMissingError) {
      return apiFail("Unauthorized", 401, "UNAUTHORIZED")
    }
    return apiFail(
      error instanceof Error ? error.message : "Update failed",
      502,
      "COMP"
    )
  }
}
