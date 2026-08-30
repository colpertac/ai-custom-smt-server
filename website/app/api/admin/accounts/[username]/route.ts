import { adminDeleteAccount, adminUpdateAccount } from "@/lib/comp-api"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { clearSession } from "@/lib/session"
import {
  CompSessionMissingError,
  requireWebSession,
  withCompSession,
} from "@/lib/web-session"
import { passwordSchema } from "@/features/auth/schemas/login.schema"
import { z } from "zod"

const updateSchema = z.object({
  dispName: z.string().trim().min(1).max(32).optional(),
  email: z
    .string()
    .trim()
    .transform((s) => s.toLowerCase())
    .refine(
      (s) => s === "" || z.string().email().safeParse(s).success,
      "Invalid email"
    )
    .optional(),
  password: z.union([passwordSchema, z.literal("")]).optional(),
  cp: z.number().int().min(0).optional(),
  ticketCount: z.number().int().min(0).max(20).optional(),
  userLevel: z.number().int().min(0).max(1000).optional(),
  enabled: z.boolean().optional(),
  banReason: z.string().max(500).optional(),
  banInitiator: z.string().max(64).optional(),
})

type Params = { params: Promise<{ username: string }> }

export async function POST(request: Request, { params }: Params) {
  const blocked = await guardApiMutation("admin-update", 30, 60_000)
  if (blocked) return blocked

  const gate = await requireWebSession()
  if (!gate) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(gate.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const { username: rawUser } = await params
  const username = rawUser.toLowerCase()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "BAD_REQUEST")
  }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  const d = parsed.data
  const payload: Parameters<typeof adminUpdateAccount>[1] = { username }
  if (d.dispName !== undefined) payload.disp_name = d.dispName
  if (d.email !== undefined) payload.email = d.email
  if (d.password) payload.password = d.password
  if (d.cp !== undefined) payload.cp = d.cp
  if (d.ticketCount !== undefined) payload.ticket_count = d.ticketCount
  if (d.userLevel !== undefined) payload.user_level = d.userLevel
  if (d.enabled !== undefined) payload.enabled = d.enabled
  if (d.banReason !== undefined) payload.ban_reason = d.banReason
  if (d.banInitiator !== undefined) payload.ban_initiator = d.banInitiator

  try {
    return await withCompSession(async (session) => {
      const result = await adminUpdateAccount(session, payload)
      if (result.error !== "Success") {
        return apiFail(result.error, 400, "UPDATE")
      }

      if (session.username === username) {
        await clearSession()
        return apiOk(
          { username, selfUpdated: true },
          "Updated (re-login required)"
        )
      }

      return apiOk({ username, selfUpdated: false })
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

export async function DELETE(_request: Request, { params }: Params) {
  const blocked = await guardApiMutation("admin-delete", 10, 60_000)
  if (blocked) return blocked

  const gate = await requireWebSession()
  if (!gate) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(gate.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const { username: rawUser } = await params
  const username = rawUser.toLowerCase()

  try {
    return await withCompSession(async (session) => {
      await adminDeleteAccount(session, username)
      if (session.username === username) {
        await clearSession()
        return apiOk({ username, selfDeleted: true })
      }
      return apiOk({ username, selfDeleted: false })
    })
  } catch (error) {
    if (error instanceof CompSessionMissingError) {
      return apiFail("Unauthorized", 401, "UNAUTHORIZED")
    }
    return apiFail(
      error instanceof Error ? error.message : "Delete failed",
      502,
      "COMP"
    )
  }
}
