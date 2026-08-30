"use client"

import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { useLogin } from "@/features/auth/hooks"
import {
  loginSchema,
  type LoginInput,
} from "@/features/auth/schemas/login.schema"
import { FieldMessage, FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function LoginForm() {
  const router = useRouter()
  const loginMutation = useLogin()

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: "onChange",
    defaultValues: { username: "", password: "" },
  })

  function onSubmit(data: LoginInput) {
    loginMutation.mutate(data, {
      onSuccess: (user) => {
        if (user.mustChangePassword) {
          router.refresh()
          return
        }
        router.push("/account")
        router.refresh()
      },
      onError: (e) => {
        form.setError("root", {
          message: e instanceof Error ? e.message : "Login failed",
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
          <FieldLabel htmlFor="login-username">Username</FieldLabel>
          <Input
            id="login-username"
            autoComplete="username"
            aria-invalid={!!errors.username || undefined}
            {...form.register("username")}
          />
          {errors.username ? (
            <FieldMessage>{errors.username.message}</FieldMessage>
          ) : null}
        </Field>
        <Field data-invalid={!!errors.password || undefined}>
          <FieldLabel htmlFor="login-password">Password</FieldLabel>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password || undefined}
            {...form.register("password")}
          />
          {errors.password ? (
            <FieldMessage>{errors.password.message}</FieldMessage>
          ) : null}
        </Field>
      </FieldGroup>

      <Button
        type="submit"
        disabled={loginMutation.isPending || !form.formState.isValid}
      >
        {loginMutation.isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  )
}
