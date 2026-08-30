"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { useForgotPassword } from "@/features/auth/hooks"
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from "@/features/auth/schemas/forgotPassword.schema"
import { FieldMessage, FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function ForgotPasswordForm() {
  const mutation = useForgotPassword()
  const [doneMessage, setDoneMessage] = useState<string | null>(null)

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: "onChange",
    defaultValues: { username: "" },
  })

  function onSubmit(data: ForgotPasswordInput) {
    setDoneMessage(null)
    mutation.mutate(data, {
      onSuccess: () => {
        setDoneMessage(
          "If that account has a recovery email, we sent a reset link."
        )
        form.reset()
      },
      onError: (e) => {
        form.setError("root", {
          message: e instanceof Error ? e.message : "Request failed",
        })
      },
    })
  }

  const errors = form.formState.errors

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      {errors.root ? <FormAlert>{errors.root.message}</FormAlert> : null}
      {doneMessage ? (
        <FormAlert variant="success">{doneMessage}</FormAlert>
      ) : null}

      <FieldGroup>
        <Field data-invalid={!!errors.username || undefined}>
          <FieldLabel htmlFor="forgot-username">Username</FieldLabel>
          <Input
            id="forgot-username"
            autoComplete="username"
            aria-invalid={!!errors.username || undefined}
            {...form.register("username")}
          />
          {errors.username ? (
            <FieldMessage>{errors.username.message}</FieldMessage>
          ) : null}
        </Field>
      </FieldGroup>

      <Button
        type="submit"
        disabled={mutation.isPending || !form.formState.isValid}
      >
        {mutation.isPending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  )
}
