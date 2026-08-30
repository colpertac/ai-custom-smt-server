import { z } from "zod"

export const changeEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .transform((s) => s.toLowerCase())
    .refine(
      (s) => s === "" || z.string().email().safeParse(s).success,
      "Invalid email"
    ),
})

export type ChangeEmailInput = z.infer<typeof changeEmailSchema>
