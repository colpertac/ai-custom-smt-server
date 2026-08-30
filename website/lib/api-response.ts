import { NextResponse } from "next/server"

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

export function apiOk<T>(data: T, message = "OK", init?: ResponseInit) {
  const body: ApiSuccess<T> = { success: true, message, data }
  return NextResponse.json(body, init)
}

export function apiFail(
  message: string,
  statusCode: number,
  error = "ERROR",
  init?: ResponseInit
) {
  const body: ApiErrorBody = {
    success: false,
    message,
    error,
    statusCode,
  }
  return NextResponse.json(body, { status: statusCode, ...init })
}
