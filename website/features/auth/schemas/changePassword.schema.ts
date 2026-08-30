import { z } from "zod"

import { passwordSchema } from "@/features/auth/schemas/login.schema"

export const changePasswordSchema = z
  .object({
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: "Passwords do not match",
    path: ["passwordConfirm"],
  })

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
