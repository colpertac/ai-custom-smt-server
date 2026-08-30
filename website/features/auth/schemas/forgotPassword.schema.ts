import { z } from "zod"

import { usernameSchema } from "@/features/auth/schemas/login.schema"

export const forgotPasswordSchema = z.object({
  username: usernameSchema,
})

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
