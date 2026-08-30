"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { useChangeEmail } from "@/features/auth/hooks"
import {
  changeEmailSchema,
  type ChangeEmailInput,
} from "@/features/auth/schemas/changeEmail.schema"
import { FieldMessage, FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function ChangeEmailForm({ defaultValue = "" }: { defaultValue?: string }) {
  const mutation = useChangeEmail()
  const form = useForm<ChangeEmailInput>({
    resolver: zodResolver(changeEmailSchema),
    mode: "onChange",
    defaultValues: { email: defaultValue },
  })

  function onSubmit(data: ChangeEmailInput) {
    mutation.mutate(data, {
      onError: (e) => {
        form.setError("root", {
          message: e instanceof Error ? e.message : "Update failed",
        })
      },
    })
  }

  const errors = form.formState.errors

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      {errors.root ? <FormAlert>{errors.root.message}</FormAlert> : null}
      {mutation.isSuccess ? (
        <FormAlert variant="success">Email updated.</FormAlert>
      ) : null}
      <FieldGroup>
        <Field data-invalid={!!errors.email || undefined}>
          <FieldLabel htmlFor="acct-email">Email</FieldLabel>
          <Input
            id="acct-email"
            type="email"
            autoComplete="email"
            placeholder="leave blank for none"
            aria-invalid={!!errors.email || undefined}
            {...form.register("email")}
          />
          {errors.email ? (
            <FieldMessage>{errors.email.message}</FieldMessage>
          ) : null}
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Saving…" : "Save email"}
      </Button>
    </form>
  )
}
