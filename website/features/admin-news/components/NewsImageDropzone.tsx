"use client"

import { useCallback, useEffect, useState } from "react"
import { useDropzone, type FileRejection } from "react-dropzone"
import { ChevronLeft, ChevronRight, Trash2, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/kyClient"

export type NewsImageItem = {
  id: number
  postId: number
  url: string
  sortOrder: number
}

type Props = {
  postId: number
  disabled?: boolean
  onError?: (message: string | null) => void
  onOk?: (message: string | null) => void
}

export function NewsImageDropzone({
  postId,
  disabled = false,
  onError,
  onOk,
}: Props) {
  const [images, setImages] = useState<NewsImageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const response = await api(`admin/news/${postId}/images`)
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { images?: NewsImageItem[] }
      }
      if (!response.ok || !json.success) {
        onError?.(json.message || `HTTP ${response.status}`)
        return
      }
      setImages(json.data?.images ?? [])
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Failed to load images")
    } finally {
      setLoading(false)
    }
  }, [onError, postId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      setBusy(true)
      onError?.(null)
      onOk?.(null)
      try {
        for (const file of files) {
          const form = new FormData()
          form.append("file", file)
          const response = await api.post(`admin/news/${postId}/images`, {
            body: form,
          })
          const json = (await response.json()) as {
            success?: boolean
            message?: string
            data?: { images?: NewsImageItem[] }
          }
          if (!response.ok || !json.success) {
            onError?.(json.message || `HTTP ${response.status}`)
            await refresh()
            return
          }
          setImages(json.data?.images ?? [])
        }
        onOk?.(
          files.length === 1
            ? "Image uploaded"
            : `${files.length} images uploaded`
        )
      } catch (e) {
        onError?.(e instanceof Error ? e.message : "Upload failed")
      } finally {
        setBusy(false)
      }
    },
    [onError, onOk, postId, refresh]
  )

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      if (rejected.length > 0) {
        const first = rejected[0]
        onError?.(
          first?.errors[0]?.message ||
            `Rejected ${first?.file.name ?? "file"}`
        )
      }
      void uploadFiles(accepted)
    },
    [onError, uploadFiles]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/webp": [".webp"],
      "image/gif": [".gif"],
    },
    maxSize: 5 * 1024 * 1024,
    disabled: disabled || busy,
    multiple: true,
  })

  const move = async (index: number, delta: -1 | 1) => {
    const next = index + delta
    if (next < 0 || next >= images.length) return
    const reordered = [...images]
    const [item] = reordered.splice(index, 1)
    reordered.splice(next, 0, item)
    const imageIds = reordered.map((img) => img.id)
    setImages(reordered)
    setBusy(true)
    onError?.(null)
    onOk?.(null)
    try {
      const response = await api.put(`admin/news/${postId}/images/reorder`, {
        json: { imageIds },
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { images?: NewsImageItem[] }
      }
      if (!response.ok || !json.success) {
        onError?.(json.message || `HTTP ${response.status}`)
        await refresh()
        return
      }
      setImages(json.data?.images ?? reordered)
      onOk?.("Order saved")
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Reorder failed")
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const remove = async (imageId: number) => {
    setBusy(true)
    onError?.(null)
    onOk?.(null)
    try {
      const response = await api.delete(
        `admin/news/${postId}/images/${imageId}`
      )
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { images?: NewsImageItem[] }
      }
      if (!response.ok || !json.success) {
        onError?.(json.message || `HTTP ${response.status}`)
        return
      }
      setImages(json.data?.images ?? [])
      onOk?.("Image deleted")
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Delete failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <span className="text-xs text-muted-foreground">Images</span>
      <div
        {...getRootProps()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 border border-dashed px-3 py-6 text-center text-xs transition-colors ${
          isDragActive
            ? "border-gold bg-muted/40"
            : "border-border bg-muted/20 hover:border-gold-dim"
        } ${disabled || busy ? "pointer-events-none opacity-60" : ""}`}
      >
        <input {...getInputProps()} />
        <Upload className="size-4 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">
          {isDragActive
            ? "Drop images here…"
            : "Drag & drop images, or click to browse"}
        </p>
        <p className="text-[0.65rem] text-muted-foreground/80">
          PNG, JPEG, WebP, GIF · max 5 MiB each · up to 20
        </p>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading images…</p>
      ) : images.length === 0 ? (
        <p className="text-xs text-muted-foreground">No images yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {images.map((image, index) => (
            <li
              key={image.id}
              className="relative w-28 border border-border bg-muted/30"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt=""
                className="aspect-square w-full object-cover"
              />
              <div className="flex items-center justify-between gap-0.5 border-t border-border/60 p-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  disabled={disabled || busy || index === 0}
                  onClick={() => void move(index, -1)}
                  aria-label="Move left"
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-destructive"
                  disabled={disabled || busy}
                  onClick={() => void remove(image.id)}
                  aria-label="Delete image"
                >
                  <Trash2 className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  disabled={disabled || busy || index === images.length - 1}
                  onClick={() => void move(index, 1)}
                  aria-label="Move right"
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
