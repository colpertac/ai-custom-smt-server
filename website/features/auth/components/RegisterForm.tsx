"use client"

import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { useRegister } from "@/features/auth/hooks"
import {
  registerSchema,
  type RegisterInput,
} from "@/features/auth/schemas/register.schema"
import { FieldMessage, FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function RegisterForm() {
  const router = useRouter()
  const registerMutation = useRegister()

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    mode: "onChange",
    defaultValues: {
      username: "",
      email: "",
      password: "",
      passwordConfirm: "",
    },
  })

  function onSubmit(data: RegisterInput) {
    registerMutation.mutate(data, {
      onSuccess: () => {
        router.push("/account")
        router.refresh()
      },
      onError: (e) => {
        form.setError("root", {
          message: e instanceof Error ? e.message : "Registration failed",
        })
      },
    })
  }

  const errors = form.formState.errors

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      {errors.root ? <FormAlert>{errors.root.message}</FormAlert> : null}

      <FieldGroup>
        <Field data-invalid={!!errors.username || undefined}>
          <FieldLabel htmlFor="reg-username">Username</FieldLabel>
          <Input
            id="reg-username"
            autoComplete="username"
            aria-invalid={!!errors.username || undefined}
            {...form.register("username")}
          />
          {errors.username ? (
            <FieldMessage>{errors.username.message}</FieldMessage>
          ) : null}
        </Field>
        <Field data-invalid={!!errors.email || undefined}>
          <FieldLabel htmlFor="reg-email">Email (optional)</FieldLabel>
          <Input
            id="reg-email"
            type="email"
            autoComplete="email"
            placeholder="leave blank if you prefer"
            aria-invalid={!!errors.email || undefined}
            {...form.register("email")}
          />
          <p className="text-xs text-muted-foreground">
            Without email, lost passwords cannot be recovered.
          </p>
          {errors.email ? (
            <FieldMessage>{errors.email.message}</FieldMessage>
          ) : null}
        </Field>
        <Field data-invalid={!!errors.password || undefined}>
          <FieldLabel htmlFor="reg-password">Password</FieldLabel>
          <Input
            id="reg-password"
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
          <FieldLabel htmlFor="reg-password2">Confirm password</FieldLabel>
          <Input
            id="reg-password2"
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
        disabled={registerMutation.isPending || !form.formState.isValid}
      >
        {registerMutation.isPending ? "Creating…" : "Create account"}
      </Button>
    </form>
  )
}
