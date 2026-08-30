"use client"

import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { useResetPassword } from "@/features/auth/hooks"
import {
  resetPasswordSchema,
  type ResetPasswordInput,
} from "@/features/auth/schemas/resetPassword.schema"
import { FieldMessage, FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter()
  const mutation = useResetPassword()

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    mode: "onChange",
    defaultValues: {
      token,
      password: "",
      passwordConfirm: "",
    },
  })

  function onSubmit(data: ResetPasswordInput) {
    mutation.mutate(data, {
      onSuccess: () => {
        router.push("/login?passwordChanged=1")
        router.refresh()
      },
      onError: (e) => {
        form.setError("root", {
          message: e instanceof Error ? e.message : "Reset failed",
        })
      },
    })
  }

  const errors = form.formState.errors

  if (!token) {
    return (
      <FormAlert>Missing reset token. Use the link from your email.</FormAlert>
    )
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      {errors.root ? <FormAlert>{errors.root.message}</FormAlert> : null}
      <input type="hidden" {...form.register("token")} />

      <FieldGroup>
        <Field data-invalid={!!errors.password || undefined}>
          <FieldLabel htmlFor="reset-password">New password</FieldLabel>
          <Input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password || undefined}
            {...form.register("password")}
          />
          {errors.password ? (
            <FieldMessage>{errors.password.message}</FieldMessage>
          ) : null}
        </Field>
        <Field data-invalid={!!errors.passwordConfirm || undefined}>
          <FieldLabel htmlFor="reset-password2">Confirm password</FieldLabel>
          <Input
            id="reset-password2"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.passwordConfirm || undefined}
            {...form.register("passwordConfirm")}
          />
          {errors.passwordConfirm ? (
            <FieldMessage>{errors.passwordConfirm.message}</FieldMessage>
          ) : null}
        </Field>
      </FieldGroup>

      <Button
        type="submit"
        disabled={mutation.isPending || !form.formState.isValid}
      >
        {mutation.isPending ? "Updating…" : "Update password"}
      </Button>
    </form>
  )
}
