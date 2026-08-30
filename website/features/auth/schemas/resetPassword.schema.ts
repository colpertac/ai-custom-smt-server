import { z } from "zod"

import { passwordSchema } from "@/features/auth/schemas/login.schema"

export const resetPasswordSchema = z
  .object({
    token: z.string().min(32, "Invalid reset link"),
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: "Passwords do not match",
    path: ["passwordConfirm"],
  })

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
