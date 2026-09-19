import {
  adminGetCharacterInventory,
  adminUpdateCharacterInventory,
  type AdminInventoryOp,
} from "@/lib/comp-api"
import { mapCharacterLobbyError } from "@/lib/admin-character-api"
import { compApiFailMessage } from "@/lib/comp-api-errors"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import {
  CompSessionMissingError,
  requireWebSession,
  withCompSession,
} from "@/lib/web-session"
import { z } from "zod"

const getSchema = z.object({
  characterName: z.string().trim().min(1).max(32),
  worldId: z.number().int().min(0).optional(),
})

const opSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.enum(["set", "add"]),
    slot: z.number().int().min(1).max(50),
    itemType: z.number().int().positive(),
    stackSize: z.number().int().min(1).max(65000).optional(),
  }),
  z.object({
    op: z.literal("set_qty"),
    slot: z.number().int().min(1).max(50),
    stackSize: z.number().int().min(1).max(65000),
  }),
  z.object({
    op: z.literal("remove"),
    slot: z.number().int().min(1).max(50),
  }),
])

const updateSchema = z.object({
  characterName: z.string().trim().min(1).max(32),
  worldId: z.number().int().min(0).optional(),
  ops: z.array(opSchema).min(1).max(50),
})

export async function GET(request: Request) {
  const gate = await requireWebSession()
  if (!gate) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(gate.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const url = new URL(request.url)
  const characterName = url.searchParams.get("characterName") ?? ""
  const worldRaw = url.searchParams.get("worldId")
  const parsed = getSchema.safeParse({
    characterName,
    worldId: worldRaw != null && worldRaw !== "" ? Number(worldRaw) : undefined,
  })
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  try {
    return await withCompSession(async (session) => {
      const result = await adminGetCharacterInventory(session, {
        character_name: parsed.data.characterName,
        world_id: parsed.data.worldId,
      })
      if (result.error !== "Success") {
        return apiFail(mapCharacterLobbyError(result.error), 400, "INVENTORY")
      }
      return apiOk({
        characterName: result.character_name ?? parsed.data.characterName,
        slots: result.slots,
      })
    })
  } catch (error) {
    if (error instanceof CompSessionMissingError) {
      return apiFail("Unauthorized", 401, "UNAUTHORIZED")
    }
    return apiFail(
      compApiFailMessage(error, "Inventory load failed"),
      502,
      "COMP"
    )
  }
}

export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-char-inventory", 40, 60_000)
  if (blocked) return blocked

  const gate = await requireWebSession()
  if (!gate) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(gate.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

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

  const ops: AdminInventoryOp[] = parsed.data.ops.map((op) => {
    if (op.op === "remove") return { op: "remove", slot: op.slot }
    if (op.op === "set_qty") {
      return { op: "set_qty", slot: op.slot, stack_size: op.stackSize }
    }
    return {
      op: op.op,
      slot: op.slot,
      item_type: op.itemType,
      stack_size: op.stackSize,
    }
  })

  try {
    return await withCompSession(async (session) => {
      const result = await adminUpdateCharacterInventory(session, {
        character_name: parsed.data.characterName,
        world_id: parsed.data.worldId,
        ops,
      })
      if (result.error !== "Success") {
        return apiFail(mapCharacterLobbyError(result.error), 400, "INVENTORY")
      }
      return apiOk({ characterName: parsed.data.characterName })
    })
  } catch (error) {
    if (error instanceof CompSessionMissingError) {
      return apiFail("Unauthorized", 401, "UNAUTHORIZED")
    }
    return apiFail(
      compApiFailMessage(error, "Inventory update failed"),
      502,
      "COMP"
    )
  }
}
