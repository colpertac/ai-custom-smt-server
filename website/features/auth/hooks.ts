"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  changeDisplayName,
  changeEmail,
  changePassword,
  fetchSessionUser,
  forgotPassword,
  login,
  logout,
  register,
  resetPasswordWithToken,
} from "@/features/auth/api"
import type { ChangeDisplayNameInput } from "@/features/auth/schemas/changeDisplayName.schema"
import type { ChangeEmailInput } from "@/features/auth/schemas/changeEmail.schema"
import type { SessionUser } from "@/features/auth/types/session"

/** Header / nav — cookie identity (SSR-seeded); no lobby challenge burn. */
export function useSessionUser() {
  return useQuery<SessionUser | null>({
    queryKey: ["session"],
    queryFn: () => fetchSessionUser(false),
    staleTime: 5 * 60 * 1000,
  })
}

/** Account panel — live lobby get_details. */
export function useSessionDetails() {
  return useQuery<SessionUser | null>({
    queryKey: ["session", "fresh"],
    queryFn: () => fetchSessionUser(true),
    staleTime: 30 * 1000,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: login,
    onSuccess: (user) => {
      queryClient.setQueryData(["session"], user)
      void queryClient.invalidateQueries({ queryKey: ["session", "fresh"] })
    },
  })
}

export function useRegister() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: register,
    onSuccess: (user) => {
      queryClient.setQueryData(["session"], user)
      void queryClient.invalidateQueries({ queryKey: ["session", "fresh"] })
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(["session"], null)
      queryClient.setQueryData(["session", "fresh"], null)
      void queryClient.invalidateQueries({ queryKey: ["session"] })
    },
  })
}

export function useChangePassword() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      queryClient.setQueryData(["session"], null)
      queryClient.setQueryData(["session", "fresh"], null)
    },
  })
}

export function useChangeDisplayName() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: ChangeDisplayNameInput) => changeDisplayName(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["session"] })
    },
  })
}

export function useChangeEmail() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: ChangeEmailInput) => changeEmail(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["session"] })
    },
  })
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: forgotPassword,
  })
}

export function useResetPassword() {
  return useMutation({
    mutationFn: resetPasswordWithToken,
  })
}
