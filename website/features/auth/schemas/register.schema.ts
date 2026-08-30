import { z } from "zod"

import {
  emailSchema,
  passwordSchema,
  usernameSchema,
} from "@/features/auth/schemas/login.schema"

export const registerSchema = z
  .object({
    username: usernameSchema,
    email: z
      .string()
      .trim()
      .transform((s) => s.toLowerCase())
      .refine(
        (s) => s === "" || emailSchema.safeParse(s).success,
        "Invalid email"
      ),
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: "Passwords do not match",
    path: ["passwordConfirm"],
  })

export type RegisterInput = z.infer<typeof registerSchema>
