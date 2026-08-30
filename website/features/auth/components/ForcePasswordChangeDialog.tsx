"use client"

import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { FieldMessage, FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  useChangePassword,
  useSessionUser,
  useSkipForcedPasswordChange,
} from "@/features/auth/hooks"
import {
  changePasswordSchema,
  type ChangePasswordInput,
} from "@/features/auth/schemas/changePassword.schema"

/**
 * Modal when signing in with factory admin/admin123.
 * Change password or skip (keeps admin123; prompt won't show again).
 */
export function ForcePasswordChangeDialog() {
  const router = useRouter()
  const { data: session } = useSessionUser()
  const changeMutation = useChangePassword()
  const skipMutation = useSkipForcedPasswordChange()
  const open = Boolean(session?.mustChangePassword)
  const busy = changeMutation.isPending || skipMutation.isPending

  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    mode: "onChange",
    defaultValues: { password: "", passwordConfirm: "" },
  })

  if (!open) return null

  function onSubmit(data: ChangePasswordInput) {
    changeMutation.mutate(data, {
      onSuccess: () => {
        router.replace("/login")
        router.refresh()
      },
      onError: (e) => {
        form.setError("root", {
          message: e instanceof Error ? e.message : "Password change failed",
        })
      },
    })
  }

  function onSkip() {
    skipMutation.mutate(undefined, {
      onSuccess: () => {
        router.push("/account")
        router.refresh()
      },
      onError: (e) => {
        form.setError("root", {
          message: e instanceof Error ? e.message : "Could not skip",
        })
      },
    })
  }

  const errors = form.formState.errors

  return (
    <Dialog open modal disablePointerDismissal>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change default admin password?</DialogTitle>
          <DialogDescription>
            Factory login is{" "}
            <code className="text-foreground">admin</code> /{" "}
            <code className="text-foreground">admin123</code>. You can set a
            stronger password now, or skip and keep using the default (fine for
            local guides / lab setups).
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          {errors.root ? <FormAlert>{errors.root.message}</FormAlert> : null}
          <FieldGroup>
            <Field data-invalid={!!errors.password || undefined}>
              <FieldLabel htmlFor="force-pw">New password</FieldLabel>
              <Input
                id="force-pw"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.password || undefined}
                disabled={busy}
                {...form.register("password")}
              />
              {errors.password ? (
                <FieldMessage>{errors.password.message}</FieldMessage>
              ) : null}
            </Field>
            <Field data-invalid={!!errors.passwordConfirm || undefined}>
              <FieldLabel htmlFor="force-pw2">Confirm password</FieldLabel>
              <Input
                id="force-pw2"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.passwordConfirm || undefined}
                disabled={busy}
                {...form.register("passwordConfirm")}
              />
              {errors.passwordConfirm ? (
                <FieldMessage>{errors.passwordConfirm.message}</FieldMessage>
              ) : null}
            </Field>
          </FieldGroup>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={onSkip}
            >
              {skipMutation.isPending ? "Skipping…" : "Skip — keep admin123"}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={busy || !form.formState.isValid}
            >
              {changeMutation.isPending ? "Saving…" : "Save and sign in again"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
