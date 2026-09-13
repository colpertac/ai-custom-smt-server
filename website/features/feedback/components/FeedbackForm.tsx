"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { useSessionUser } from "@/features/auth/hooks"
import { useSubmitFeedback } from "@/features/feedback/hooks"
import {
  feedbackSchema,
  type FeedbackInput,
} from "@/features/feedback/schemas/feedback.schema"
import {
  FEEDBACK_BODY_MAX,
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_IMAGE_MAX_BYTES,
} from "@/lib/feedback-constants"
import { FieldMessage, FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif"

export function FeedbackForm() {
  const { data: session } = useSessionUser()
  const mutation = useSubmitFeedback()
  const [doneMessage, setDoneMessage] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [fileKey, setFileKey] = useState(0)

  const form = useForm<FeedbackInput>({
    resolver: zodResolver(feedbackSchema),
    mode: "onChange",
    defaultValues: { category: "other", body: "" },
  })

  function onFileChange(next: File | null) {
    setFileError(null)
    if (next && next.size > FEEDBACK_IMAGE_MAX_BYTES) {
      setFile(null)
      setFileError("Screenshot must be 5 MiB or smaller")
      setFileKey((k) => k + 1)
      return
    }
    setFile(next)
  }

  function onSubmit(data: FeedbackInput) {
    setDoneMessage(null)
    form.clearErrors("root")
    const payload = new FormData()
    payload.append("category", data.category)
    payload.append("body", data.body)
    if (file) payload.append("file", file)

    mutation.mutate(payload, {
      onSuccess: () => {
        setDoneMessage("Thanks — we got it.")
        form.reset({ category: "other", body: "" })
        setFile(null)
        setFileError(null)
        setFileKey((k) => k + 1)
      },
      onError: (e) => {
        form.setError("root", {
          message: e instanceof Error ? e.message : "Submit failed",
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

      <p className="text-xs text-muted-foreground">
        {session ? (
          <>Submitting as {session.dispName || session.username}.</>
        ) : (
          <>
            Submitting anonymously.{" "}
            <Link
              href="/login"
              className="text-primary underline-offset-4 hover:underline"
            >
              Sign in
            </Link>{" "}
            if you want this attached to your account.
          </>
        )}
      </p>

      <FieldGroup>
        <Field data-invalid={!!errors.category || undefined}>
          <FieldLabel htmlFor="feedback-category">Category</FieldLabel>
          <select
            id="feedback-category"
            className="flex h-(--density-control-h) w-full rounded-none border border-border bg-background/70 px-(--density-control-px) text-sm outline-none focus-visible:border-gold-dim focus-visible:ring-2 focus-visible:ring-ring/30"
            aria-invalid={!!errors.category || undefined}
            {...form.register("category")}
          >
            {FEEDBACK_CATEGORIES.map((id) => (
              <option key={id} value={id}>
                {FEEDBACK_CATEGORY_LABELS[id]}
              </option>
            ))}
          </select>
          {errors.category ? (
            <FieldMessage>{errors.category.message}</FieldMessage>
          ) : null}
        </Field>

        <Field data-invalid={!!errors.body || undefined}>
          <FieldLabel htmlFor="feedback-body">What happened</FieldLabel>
          <Textarea
            id="feedback-body"
            className="min-h-28 rounded-none"
            placeholder="Untranslated NPC line, crashy demon, lag around 4am…"
            maxLength={FEEDBACK_BODY_MAX}
            aria-invalid={!!errors.body || undefined}
            {...form.register("body")}
          />
          {errors.body ? (
            <FieldMessage>{errors.body.message}</FieldMessage>
          ) : null}
        </Field>

        <Field data-invalid={!!fileError || undefined}>
          <FieldLabel htmlFor="feedback-file">Screenshot (optional)</FieldLabel>
          <Input
            id="feedback-file"
            key={fileKey}
            type="file"
            accept={ACCEPT}
            aria-invalid={!!fileError || undefined}
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <p className="text-xs text-muted-foreground">{file.name}</p>
          ) : null}
          {fileError ? <FieldMessage>{fileError}</FieldMessage> : null}
        </Field>
      </FieldGroup>

      <Button
        type="submit"
        disabled={
          mutation.isPending || !form.formState.isValid || Boolean(fileError)
        }
      >
        {mutation.isPending ? "Sending…" : "Submit"}
      </Button>
    </form>
  )
}
