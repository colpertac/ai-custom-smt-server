"use client"

import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { useChangePassword } from "@/features/auth/hooks"
import {
  changePasswordSchema,
  type ChangePasswordInput,
} from "@/features/auth/schemas/changePassword.schema"
import { FieldMessage, FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function ChangePasswordForm() {
  const router = useRouter()
  const mutation = useChangePassword()

  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    mode: "onChange",
    defaultValues: { password: "", passwordConfirm: "" },
  })

  function onSubmit(data: ChangePasswordInput) {
    mutation.mutate(data, {
      onSuccess: () => {
        router.push("/login?passwordChanged=1")
        router.refresh()
      },
      onError: (e) => {
        form.setError("root", {
          message: e instanceof Error ? e.message : "Password change failed",
        })
      },
    })
  }

  const errors = form.formState.errors

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      {errors.root ? <FormAlert>{errors.root.message}</FormAlert> : null}

      <FieldGroup>
        <Field data-invalid={!!errors.password || undefined}>
          <FieldLabel htmlFor="pw-new">New password</FieldLabel>
          <Input
            id="pw-new"
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
          <FieldLabel htmlFor="pw-confirm">Confirm password</FieldLabel>
          <Input
            id="pw-confirm"
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
        {mutation.isPending ? "Updating…" : "Change password"}
      </Button>
    </form>
  )
}
