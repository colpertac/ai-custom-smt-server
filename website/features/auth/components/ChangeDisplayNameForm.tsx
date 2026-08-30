"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { useChangeDisplayName } from "@/features/auth/hooks"
import {
  changeDisplayNameSchema,
  type ChangeDisplayNameInput,
} from "@/features/auth/schemas/changeDisplayName.schema"
import { FieldMessage, FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function ChangeDisplayNameForm({
  defaultValue = "",
}: {
  defaultValue?: string
}) {
  const mutation = useChangeDisplayName()
  const form = useForm<ChangeDisplayNameInput>({
    resolver: zodResolver(changeDisplayNameSchema),
    mode: "onChange",
    defaultValues: { dispName: defaultValue },
  })

  function onSubmit(data: ChangeDisplayNameInput) {
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
        <FormAlert variant="success">Account name updated.</FormAlert>
      ) : null}
      <FieldGroup>
        <Field data-invalid={!!errors.dispName || undefined}>
          <FieldLabel htmlFor="disp-name">Account name</FieldLabel>
          <Input
            id="disp-name"
            aria-invalid={!!errors.dispName || undefined}
            {...form.register("dispName")}
          />
          {errors.dispName ? (
            <FieldMessage>{errors.dispName.message}</FieldMessage>
          ) : null}
        </Field>
      </FieldGroup>
      <Button
        type="submit"
        disabled={mutation.isPending || !form.formState.isValid}
      >
        {mutation.isPending ? "Saving…" : "Save account name"}
      </Button>
    </form>
  )
}
