"use client"

import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"

import type { AdminAccount } from "@/features/admin/api"
import {
  useAdminAccounts,
  useDeleteAdminAccount,
  useUpdateAdminAccount,
} from "@/features/admin/hooks"
import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type EditForm = {
  email: string
  password: string
  cp: number
  ticketCount: number
  userLevel: number
  enabled: boolean
  banReason: string
  banInitiator: string
}

function toForm(a: AdminAccount): EditForm {
  return {
    email: a.email || "",
    password: "",
    cp: a.cp ?? 0,
    ticketCount: a.ticketCount ?? 0,
    userLevel: a.userLevel ?? 0,
    enabled: a.enabled ?? true,
    banReason: a.banReason || "",
    banInitiator: a.banInitiator || "",
  }
}

export function AdminAccountsPanel() {
  const { data, isLoading, isError, error } = useAdminAccounts()
  const updateMutation = useUpdateAdminAccount()
  const deleteMutation = useDeleteAdminAccount()
  const [filter, setFilter] = useState("")
  const [selected, setSelected] = useState<string | null>(null)

  const accounts = useMemo(() => {
    const list = data ?? []
    const q = filter.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (a) =>
        a.username.includes(q) ||
        (a.email || "").toLowerCase().includes(q)
    )
  }, [data, filter])

  const current = accounts.find((a) => a.username === selected) ?? null

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading accounts…</p>
  }
  if (isError) {
    return (
      <p className="mt-8 text-sm font-medium text-[#ff9b9b]">
        {error instanceof Error ? error.message : "Failed to load accounts"}
      </p>
    )
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accounts</CardTitle>
          <CardDescription>
            {data?.length ?? 0} total — click a row to edit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Filter username / email…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="max-h-[28rem] overflow-auto border border-border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-muted/80 text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 font-medium">User</th>
                  <th className="px-2 py-2 font-medium">Lvl</th>
                  <th className="px-2 py-2 font-medium">CP</th>
                  <th className="px-2 py-2 font-medium">On</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr
                    key={a.username}
                    className={`cursor-pointer border-t border-border hover:bg-muted/40 ${
                      selected === a.username ? "bg-muted/60" : ""
                    }`}
                    onClick={() => setSelected(a.username)}
                  >
                    <td className="px-2 py-2 font-medium">{a.username}</td>
                    <td className="px-2 py-2">{a.userLevel ?? 0}</td>
                    <td className="px-2 py-2">{a.cp ?? 0}</td>
                    <td className="px-2 py-2">
                      {a.enabled === false ? "no" : "yes"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {current ? `Edit ${current.username}` : "Select an account"}
          </CardTitle>
          <CardDescription>
            Sets user_level, CP, tickets, email, password, bans, and enabled.
            Editing yourself forces re-login.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {current ? (
            <AccountEditForm
              key={current.username}
              account={current}
              busy={updateMutation.isPending || deleteMutation.isPending}
              error={
                (updateMutation.error || deleteMutation.error) instanceof Error
                  ? (updateMutation.error || deleteMutation.error)?.message
                  : undefined
              }
              onSave={(payload) =>
                updateMutation.mutate({ username: current.username, payload })
              }
              onDelete={() => {
                if (
                  confirm(
                    `Delete account ${current.username}? This cannot be undone.`
                  )
                ) {
                  deleteMutation.mutate(current.username, {
                    onSuccess: () => setSelected(null),
                  })
                }
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Choose a row on the left.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function AccountEditForm({
  account,
  busy,
  error,
  onSave,
  onDelete,
}: {
  account: AdminAccount
  busy: boolean
  error?: string
  onSave: (payload: Record<string, unknown>) => void
  onDelete: () => void
}) {
  const form = useForm<EditForm>({
    defaultValues: toForm(account),
  })

  function submit(data: EditForm) {
    onSave({
      email: data.email,
      password: data.password || undefined,
      cp: Number(data.cp),
      ticketCount: Number(data.ticketCount),
      userLevel: Number(data.userLevel),
      enabled: data.enabled,
      banReason: data.banReason,
      banInitiator: data.banInitiator,
    })
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-4">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <FieldGroup>
        <Field>
          <FieldLabel>Email (blank = none)</FieldLabel>
          <Input type="email" {...form.register("email")} />
        </Field>
        <Field>
          <FieldLabel>New password (optional)</FieldLabel>
          <Input type="password" autoComplete="new-password" {...form.register("password")} />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field>
            <FieldLabel>CP</FieldLabel>
            <Input type="number" {...form.register("cp", { valueAsNumber: true })} />
          </Field>
          <Field>
            <FieldLabel>Tickets</FieldLabel>
            <Input
              type="number"
              {...form.register("ticketCount", { valueAsNumber: true })}
            />
          </Field>
          <Field>
            <FieldLabel>User level</FieldLabel>
            <Input
              type="number"
              {...form.register("userLevel", { valueAsNumber: true })}
            />
          </Field>
        </div>
        <Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...form.register("enabled")} />
            Enabled
          </label>
        </Field>
        <Field>
          <FieldLabel>Ban reason</FieldLabel>
          <Input {...form.register("banReason")} />
        </Field>
        <Field>
          <FieldLabel>Ban initiator</FieldLabel>
          <Input {...form.register("banInitiator")} />
        </Field>
      </FieldGroup>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="destructive" disabled={busy} onClick={onDelete}>
          Delete account
        </Button>
      </div>
    </form>
  )
}
