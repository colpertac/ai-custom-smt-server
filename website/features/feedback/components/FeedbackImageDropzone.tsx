"use client"

import { useCallback, useEffect, useMemo } from "react"
import { useDropzone, type FileRejection } from "react-dropzone"
import { Trash2, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  FEEDBACK_IMAGE_MAX_BYTES,
  FEEDBACK_IMAGE_MAX_COUNT,
} from "@/lib/feedback-constants"

const ACCEPT = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
} as const

type Props = {
  files: File[]
  onChange: (files: File[]) => void
  error?: string | null
  onError: (message: string | null) => void
  disabled?: boolean
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

export function FeedbackImageDropzone({
  files,
  onChange,
  error,
  onError,
  disabled = false,
}: Props) {
  const remaining = FEEDBACK_IMAGE_MAX_COUNT - files.length
  const full = remaining <= 0

  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files]
  )

  useEffect(() => {
    return () => {
      for (const preview of previews) URL.revokeObjectURL(preview.url)
    }
  }, [previews])

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      onError(null)
      if (rejected.length > 0) {
        const first = rejected[0]
        const code = first?.errors[0]?.code
        if (code === "file-too-large") {
          onError("Each screenshot must be 5 MiB or smaller")
        } else if (code === "file-invalid-type") {
          onError("Use PNG, JPEG, WebP, or GIF")
        } else if (code === "too-many-files") {
          onError(`At most ${FEEDBACK_IMAGE_MAX_COUNT} screenshots`)
        } else {
          onError(first?.errors[0]?.message || "Could not add that file")
        }
      }
      if (accepted.length === 0) return
      const room = FEEDBACK_IMAGE_MAX_COUNT - files.length
      const next = accepted.slice(0, Math.max(0, room))
      if (next.length < accepted.length) {
        onError(`At most ${FEEDBACK_IMAGE_MAX_COUNT} screenshots`)
      }
      if (next.length > 0) onChange([...files, ...next])
    },
    [files, onChange, onError]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxSize: FEEDBACK_IMAGE_MAX_BYTES,
    multiple: true,
    disabled: disabled || full,
  })

  function removeAt(index: number) {
    onError(null)
    onChange(files.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      <div
        {...getRootProps()}
        className={`flex flex-col items-center justify-center gap-1 border border-dashed px-3 py-6 text-center text-xs transition-colors ${
          full
            ? "cursor-default border-border bg-muted/10 opacity-70"
            : "cursor-pointer"
        } ${
          isDragActive
            ? "border-gold bg-muted/40"
            : "border-border bg-muted/20 hover:border-gold-dim"
        } ${disabled ? "pointer-events-none opacity-60" : ""}`}
      >
        <input {...getInputProps()} />
        <Upload className="size-4 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">
          {full
            ? "Four screenshots attached"
            : isDragActive
              ? "Drop images here…"
              : "Drag & drop screenshots, or click to browse"}
        </p>
        <p className="text-[0.65rem] text-muted-foreground/80">
          PNG, JPEG, WebP, GIF · max 5 MiB each · {files.length}/
          {FEEDBACK_IMAGE_MAX_COUNT}
        </p>
      </div>

      {previews.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {previews.map((preview, index) => (
            <li
              key={`${preview.file.name}-${preview.file.size}-${preview.file.lastModified}-${index}`}
              className="relative border border-border bg-muted/30"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.url}
                alt={preview.file.name}
                className="aspect-square w-full object-cover"
              />
              <div className="flex items-center justify-between gap-1 border-t border-border/60 px-1.5 py-1">
                <p className="min-w-0 truncate text-[0.65rem] text-muted-foreground">
                  {formatSize(preview.file.size)}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 shrink-0 p-0 text-destructive"
                  disabled={disabled}
                  onClick={() => removeAt(index)}
                  aria-label={`Remove ${preview.file.name}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? null : (
        <p className="text-[0.65rem] text-muted-foreground">
          Optional. A couple of shots of the text, NPC, or lag help a lot.
        </p>
      )}
    </div>
  )
}
