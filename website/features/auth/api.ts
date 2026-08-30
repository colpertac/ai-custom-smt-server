import { fetcher } from "@/lib/fetcher"
import type { LoginInput } from "@/features/auth/schemas/login.schema"
import type { RegisterInput } from "@/features/auth/schemas/register.schema"
import type { ChangePasswordInput } from "@/features/auth/schemas/changePassword.schema"
import type { ForgotPasswordInput } from "@/features/auth/schemas/forgotPassword.schema"
import type { ResetPasswordInput } from "@/features/auth/schemas/resetPassword.schema"
import type { SessionUser } from "@/features/auth/types/session"

export const login = (payload: LoginInput) =>
  fetcher<SessionUser>("auth/login", { method: "POST", json: payload })

export const register = (payload: RegisterInput) =>
  fetcher<SessionUser>("auth/register", {
    method: "POST",
    json: payload,
  })

export const logout = () =>
  fetcher<null>("auth/logout", { method: "POST", json: {} })

export const fetchSessionUser = (fresh = false) =>
  fetcher<SessionUser | null>(fresh ? "auth/me?fresh=1" : "auth/me")

export const changePassword = (payload: ChangePasswordInput) =>
  fetcher<null>("auth/password", { method: "POST", json: payload })

export const skipForcedPasswordChange = () =>
  fetcher<{ mustChangePassword: boolean }>("auth/password/skip", {
    method: "POST",
    json: {},
  })

export const changeDisplayName = (payload: {
  dispName: string
}) =>
  fetcher<{ dispName: string }>("auth/display-name", {
    method: "POST",
    json: payload,
  })

export const changeEmail = (payload: { email: string }) =>
  fetcher<{ email: string }>("auth/email", {
    method: "POST",
    json: payload,
  })

export const forgotPassword = (payload: ForgotPasswordInput) =>
  fetcher<null>("auth/forgot-password", {
    method: "POST",
    json: payload,
  })

export const resetPasswordWithToken = (payload: ResetPasswordInput) =>
  fetcher<null>("auth/reset-password", {
    method: "POST",
    json: payload,
  })
