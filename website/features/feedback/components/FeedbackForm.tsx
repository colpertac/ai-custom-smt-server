"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { useSessionUser } from "@/features/auth/hooks"
import { FeedbackImageDropzone } from "@/features/feedback/components/FeedbackImageDropzone"
import { useSubmitFeedback } from "@/features/feedback/hooks"
import {
  feedbackSchema,
  type FeedbackInput,
} from "@/features/feedback/schemas/feedback.schema"
import {
  FEEDBACK_BODY_MAX,
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
} from "@/lib/feedback-constants"
import { FieldMessage, FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"

export function FeedbackForm() {
  const { data: session } = useSessionUser()
  const mutation = useSubmitFeedback()
  const [doneMessage, setDoneMessage] = useState<string | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [fileError, setFileError] = useState<string | null>(null)

  const form = useForm<FeedbackInput>({
    resolver: zodResolver(feedbackSchema),
    mode: "onChange",
    defaultValues: { category: "other", body: "" },
  })
  const body = useWatch({ control: form.control, name: "body" }) ?? ""

  function onSubmit(data: FeedbackInput) {
    setDoneMessage(null)
    form.clearErrors("root")
    const payload = new FormData()
    payload.append("category", data.category)
    payload.append("body", data.body)
    for (const file of files) payload.append("files", file)

    mutation.mutate(payload, {
      onSuccess: () => {
        setDoneMessage("Thanks — we got it.")
        form.reset({ category: "other", body: "" })
        setFiles([])
        setFileError(null)
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
            className="min-h-40 rounded-none"
            placeholder="Untranslated NPC line, crashy demon, lag around 4am… include where you were, who you talked to, and what you expected."
            maxLength={FEEDBACK_BODY_MAX}
            aria-invalid={!!errors.body || undefined}
            {...form.register("body")}
          />
          <div className="flex items-start justify-between gap-3">
            {errors.body ? (
              <FieldMessage>{errors.body.message}</FieldMessage>
            ) : (
              <p className="text-[0.65rem] text-muted-foreground">
                More detail is better — steps, map, time of day, who else was
                around.
              </p>
            )}
            <p className="shrink-0 text-[0.65rem] text-muted-foreground tabular-nums">
              {body.length}/{FEEDBACK_BODY_MAX}
            </p>
          </div>
        </Field>

        <Field data-invalid={!!fileError || undefined}>
          <FieldLabel>Screenshots (optional)</FieldLabel>
          <FeedbackImageDropzone
            files={files}
            onChange={setFiles}
            error={fileError}
            onError={setFileError}
            disabled={mutation.isPending}
          />
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
