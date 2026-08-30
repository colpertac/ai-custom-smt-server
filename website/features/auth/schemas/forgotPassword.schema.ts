import { z } from "zod"

import { usernameSchema } from "@/features/auth/schemas/login.schema"

const looksLikeEmail = (value: string) => value.includes("@")

/** Username or recovery email — one field for the forgot-password form. */
export const forgotPasswordSchema = z.object({
  account: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Enter your username or email")
    .max(320)
    .superRefine((value, ctx) => {
      if (looksLikeEmail(value)) {
        const email = z.string().email().safeParse(value)
        if (!email.success) {
          ctx.addIssue({
            code: "custom",
            message: "Enter a valid email address",
          })
        }
        return
      }
      const user = usernameSchema.safeParse(value)
      if (!user.success) {
        ctx.addIssue({
          code: "custom",
          message:
            user.error.issues[0]?.message ??
            "Enter a valid username or email",
        })
      }
    }),
})

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

export function isForgotPasswordEmail(account: string): boolean {
  return looksLikeEmail(account.trim())
}
