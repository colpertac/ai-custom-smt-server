import type { Options } from "ky"

import { api } from "@/lib/kyClient"

export type ApiSuccess<T> = {
  success: true
  message: string
  data: T
}

export type ApiErrorBody = {
  success: false
  message: string
  error: string
  statusCode: number
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorBody

export async function fetcher<T>(url: string, options?: Options): Promise<T> {
  const cleanUrl = url.startsWith("/") ? url.slice(1) : url

  const response = await api(cleanUrl, options)

  if (!response.ok) {
    let message = `HTTP ${response.status}`
    let errorCode = "HTTP_ERROR"
    let errorData: Record<string, unknown> | undefined
    try {
      const parsed = (await response.json()) as Partial<ApiErrorBody> & {
        data?: unknown
      }
      const raw = parsed?.message
      message =
        typeof raw === "string" && raw
          ? raw
          : Array.isArray(raw)
            ? (raw as string[]).join(", ")
            : message
      errorCode = parsed?.error || errorCode
      if (parsed?.data !== undefined) {
        errorData = parsed.data as Record<string, unknown>
      }
    } catch {
      /* keep defaults */
    }
    const err = new Error(message) as Error & {
      statusCode: number
      error: string
      data?: unknown
    }
    err.statusCode = response.status
    err.error = errorCode
    if (errorData !== undefined) err.data = errorData
    throw err
  }

  if (response.status === 204) {
    return undefined as T
  }

  const json = (await response.json()) as ApiResponse<T>
  if (!json.success) {
    const err = new Error(json.message) as Error & {
      statusCode: number
      error: string
    }
    err.statusCode = json.statusCode
    err.error = json.error
    throw err
  }

  return json.data
}
