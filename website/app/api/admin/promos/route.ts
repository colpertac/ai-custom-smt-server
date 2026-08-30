import {
  adminCreatePromo,
  adminGetPromos,
  isCreatePromoSuccess,
  type PromoLimitType,
} from "@/lib/comp-api"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import {
  loadShopProducts,
  resolveShopProduct,
  type ShopProductInfo,
} from "@/lib/shop-products"
import {
  CompSessionMissingError,
  requireWebSession,
  withCompSession,
} from "@/lib/web-session"
import { z } from "zod"

/** Client Promotion Code field: exactly 16 letters (A–Z / a–z). */
export const PROMO_CODE_LENGTH = 16
export const PROMO_CODE_PATTERN = /^[A-Za-z]{16}$/

const createSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(
        PROMO_CODE_PATTERN,
        "Code must be exactly 16 letters (A–Z only; no numbers, spaces, or symbols)"
      ),
    startTime: z.number().int().positive("Start time is required"),
    endTime: z.number().int().positive("End time is required"),
    useLimit: z.number().int().min(0).max(255).default(1),
    limitType: z.enum(["character", "world", "account"]).default("account"),
    items: z
      .array(z.number().int().positive())
      .min(1, "At least one shop product ID is required"),
  })
  .refine((d) => d.endTime >= d.startTime, {
    message: "End time must be on or after start time",
    path: ["endTime"],
  })

export type AdminPromoItem = {
  productId: number
  preview: ShopProductInfo | null
}

export type AdminPromoRow = {
  code: string
  startTime: number
  endTime: number
  useLimit: number
  limitType: PromoLimitType
  items: AdminPromoItem[]
}

function enrichPromos(
  promos: Awaited<ReturnType<typeof adminGetPromos>>
): { promos: AdminPromoRow[]; productExtractPresent: boolean } {
  const extract = loadShopProducts()
  const products = extract?.products ?? null
  return {
    productExtractPresent: extract != null,
    promos: promos.map((p) => ({
      code: p.code,
      startTime: p.startTime,
      endTime: p.endTime,
      useLimit: p.useLimit,
      limitType: p.limitType,
      items: p.items.map((productId) => ({
        productId,
        preview: resolveShopProduct(products, productId),
      })),
    })),
  }
}

export async function GET() {
  const gate = await requireWebSession()
  if (!gate) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(gate.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const promos = await withCompSession(async (session) =>
      adminGetPromos(session)
    )
    return apiOk(enrichPromos(promos))
  } catch (error) {
    if (error instanceof CompSessionMissingError) {
      return apiFail("Unauthorized", 401, "UNAUTHORIZED")
    }
    return apiFail(
      error instanceof Error ? error.message : "Failed to list promos",
      502,
      "COMP"
    )
  }
}

export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-promos-create", 20, 60_000)
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

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  const extract = loadShopProducts()
  if (extract) {
    for (const productId of parsed.data.items) {
      if (!resolveShopProduct(extract.products, productId)) {
        return apiFail(
          `Unknown shop product ID ${productId} (not in shop-products.json)`,
          400,
          "INVALID_PRODUCT"
        )
      }
    }
  }

  try {
    return await withCompSession(async (session) => {
      const result = await adminCreatePromo(session, parsed.data)
      if (!isCreatePromoSuccess(result.error)) {
        return apiFail(result.error, 400, "CREATE_PROMO")
      }

      const list = await adminGetPromos(session)
      const enriched = enrichPromos(list)
      const created = enriched.promos.filter(
        (p) => p.code === parsed.data.code
      )

      return apiOk(
        {
          ...enriched,
          created,
          duplicateWarning: result.error.startsWith(
            "Promotion with that code already exists"
          ),
        },
        result.error === "Success" ? "Promo created" : result.error
      )
    })
  } catch (error) {
    if (error instanceof CompSessionMissingError) {
      return apiFail("Unauthorized", 401, "UNAUTHORIZED")
    }
    return apiFail(
      error instanceof Error ? error.message : "Create promo failed",
      502,
      "COMP"
    )
  }
}
