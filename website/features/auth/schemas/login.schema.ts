import { z } from "zod"

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z][a-z0-9]{3,31}$/,
    "Username must be 4–32 chars, start with a letter"
  )

export const passwordSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9\\()[\]/{}~`'"<>.,_|!@#$%^&*+=-]{6,16}$/,
    "Password must be 6–16 allowed characters"
  )

export const emailSchema = z.string().trim().email("Invalid email")

export const loginSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
})

export type LoginInput = z.infer<typeof loginSchema>
