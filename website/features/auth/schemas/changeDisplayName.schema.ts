import { z } from "zod"

export const changeDisplayNameSchema = z.object({
  dispName: z.string().trim().min(1, "Account name required").max(32),
})

export type ChangeDisplayNameInput = z.infer<typeof changeDisplayNameSchema>
