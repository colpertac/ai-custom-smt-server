"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { Mars, Venus, VenusAndMars } from "lucide-react"
import { Controller, useForm } from "react-hook-form"

import type { AdminAccount } from "@/features/admin/api"
import {
  deleteAdminCharacter,
  renameAdminCharacter,
  transferAdminCharacter,
} from "@/features/admin/api"
import { CharacterInventoryDialog } from "@/features/admin/components/CharacterInventoryDialog"
import {
  useAdminAccountCharacters,
  useAdminAccounts,
  useDeleteAdminAccount,
  useUpdateAdminAccount,
} from "@/features/admin/hooks"
import { useSessionUser } from "@/features/auth/hooks"
import { useConfirm } from "@/components/confirm-dialog"
import { FormAlert } from "@/components/form-alert"
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
import { Switch } from "@/components/ui/switch"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

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
  const confirm = useConfirm()
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
    <div className="mt-3 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
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
                  <th className="px-2 py-2 font-medium">Admin</th>
                  <th className="px-2 py-2 font-medium">CP</th>
                  <th className="px-2 py-2 font-medium">Chars</th>
                  <th className="px-2 py-2 font-medium">Status</th>
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
                    <td className="px-2 py-2">{a.characterCount ?? 0}</td>
                    <td
                      className={cn(
                        "px-2 py-2 font-medium",
                        a.enabled === false
                          ? "text-[#ff9b9b]"
                          : "text-muted-foreground"
                      )}
                    >
                      {a.enabled === false ? "Banned" : "Active"}
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
            Toggle Banned, optionally note who/why, then Save. Editing yourself
            forces re-login.
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
                void (async () => {
                  const ok = await confirm({
                    title: "Delete this account?",
                    description: `Account ${current.username} and its world characters will be removed permanently. This cannot be undone.`,
                    confirmLabel: "Delete",
                    variant: "destructive",
                  })
                  if (!ok) return
                  deleteMutation.mutate(current.username, {
                    onSuccess: () => setSelected(null),
                  })
                })()
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
  const { data: session } = useSessionUser()
  const isSelf =
    (session?.username || "").toLowerCase() === account.username.toLowerCase()
  const form = useForm<EditForm>({
    defaultValues: toForm(account),
  })
  const banned = !form.watch("enabled")

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
      <AccountCharactersList username={account.username} />
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
            <FieldLabel>Admin level</FieldLabel>
            <Input
              type="number"
              {...form.register("userLevel", { valueAsNumber: true })}
            />
          </Field>
        </div>

        <div
          className={cn(
            "space-y-3 border p-3",
            banned
              ? "border-[#ff9b9b]/55 bg-[#ff9b9b]/8"
              : "border-border bg-muted/30"
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p
                className={cn(
                  "text-sm font-medium",
                  banned ? "text-[#ff9b9b]" : "text-foreground"
                )}
              >
                {banned ? "Account banned" : "Account active"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isSelf
                  ? "You can’t ban the account you’re using — switch to another admin first."
                  : banned
                    ? "Login is blocked. Turn this off and Save to unban."
                    : "Turn on and Save to ban — they cannot log in."}
              </p>
            </div>
            <Controller
              name="enabled"
              control={form.control}
              render={({ field }) => (
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={cn(
                      "text-xs font-medium uppercase tracking-wide",
                      !field.value
                        ? "text-[#ff9b9b]"
                        : "text-muted-foreground"
                    )}
                  >
                    Banned
                  </span>
                  <Switch
                    checked={!field.value}
                    disabled={busy || isSelf}
                    onCheckedChange={(on) => {
                      field.onChange(!on)
                      if (on) {
                        const who = (session?.username || "").trim()
                        if (who && !form.getValues("banInitiator").trim()) {
                          form.setValue("banInitiator", who)
                        }
                      }
                    }}
                    aria-label="Ban this account"
                    className={cn(
                      !field.value &&
                        "data-checked:bg-[#c44] data-checked:border-[#c44] data-[checked]:bg-[#c44] data-[checked]:border-[#c44] data-checked:shadow-[#c44]/35"
                    )}
                  />
                </div>
              )}
            />
          </div>
          <Field>
            <FieldLabel>Ban reason</FieldLabel>
            <Input
              {...form.register("banReason")}
              placeholder="Why they’re banned (optional)"
              disabled={busy}
            />
          </Field>
          <Field>
            <FieldLabel>Banned by</FieldLabel>
            <Input
              {...form.register("banInitiator")}
              placeholder="GM / admin name (audit log)"
              disabled={busy}
            />
            <p className="mt-1 text-[0.7rem] text-muted-foreground">
              Who applied the ban — for your records only. Use a name, not only
              digits.
            </p>
          </Field>
        </div>
      </FieldGroup>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={busy || isSelf}
          onClick={onDelete}
        >
          Delete account
        </Button>
      </div>
    </form>
  )
}

function GenderIcon({ gender }: { gender: number }) {
  if (gender === 0) {
    return (
      <span
        className="inline-flex text-sky-400"
        title="Male"
        aria-label="Male"
      >
        <Mars className="size-3.5" aria-hidden strokeWidth={2.25} />
      </span>
    )
  }
  if (gender === 1) {
    return (
      <span
        className="inline-flex text-fuchsia-400"
        title="Female"
        aria-label="Female"
      >
        <Venus className="size-3.5" aria-hidden strokeWidth={2.25} />
      </span>
    )
  }
  return (
    <span
      className="inline-flex text-gold-dim"
      title={`Gender ${gender}`}
      aria-label={`Gender ${gender}`}
    >
      <VenusAndMars className="size-3.5" aria-hidden strokeWidth={2.25} />
    </span>
  )
}

function formatLastLogin(ts: number): string {
  if (!ts) return "—"
  // COMP stores unix seconds
  const d = new Date(ts * 1000)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toISOString().slice(0, 10)
}

type CharDialog =
  | { kind: "rename"; name: string }
  | { kind: "transfer"; name: string }
  | { kind: "delete"; name: string }
  | null

function AccountCharactersList({ username }: { username: string }) {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, error } = useAdminAccountCharacters(username)
  const characters = data?.characters ?? []
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [inventoryName, setInventoryName] = useState<string | null>(null)
  const [dialog, setDialog] = useState<CharDialog>(null)
  const [renameValue, setRenameValue] = useState("")
  const [transferValue, setTransferValue] = useState("")
  const [deleteConfirm, setDeleteConfirm] = useState("")

  async function refreshChars() {
    await queryClient.invalidateQueries({
      queryKey: ["admin", "accounts", username, "characters"],
    })
    await queryClient.invalidateQueries({ queryKey: ["admin", "accounts"] })
  }

  function closeDialog() {
    if (busy) return
    setDialog(null)
    setDialogError(null)
    setRenameValue("")
    setTransferValue("")
    setDeleteConfirm("")
  }

  function openRename(name: string) {
    setDialogError(null)
    setRenameValue(name)
    setDialog({ kind: "rename", name })
  }

  function openTransfer(name: string) {
    setDialogError(null)
    setTransferValue("")
    setDialog({ kind: "transfer", name })
  }

  function openDelete(name: string) {
    setDialogError(null)
    setDeleteConfirm("")
    setDialog({ kind: "delete", name })
  }

  async function submitRename() {
    if (!dialog || dialog.kind !== "rename") return
    const newName = renameValue.trim()
    if (!newName) {
      setDialogError("Enter a new name.")
      return
    }
    if (newName === dialog.name) {
      closeDialog()
      return
    }
    setBusy(true)
    setDialogError(null)
    try {
      await renameAdminCharacter({
        characterName: dialog.name,
        newName,
      })
      setDialog(null)
      setRenameValue("")
      await refreshChars()
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : "Rename failed")
    } finally {
      setBusy(false)
    }
  }

  async function submitTransfer() {
    if (!dialog || dialog.kind !== "transfer") return
    const toUsername = transferValue.trim().toLowerCase()
    if (!toUsername) {
      setDialogError("Enter a destination username.")
      return
    }
    setBusy(true)
    setDialogError(null)
    try {
      await transferAdminCharacter({
        characterName: dialog.name,
        toUsername,
      })
      setDialog(null)
      setTransferValue("")
      await refreshChars()
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : "Transfer failed")
    } finally {
      setBusy(false)
    }
  }

  async function submitDelete() {
    if (!dialog || dialog.kind !== "delete") return
    if (deleteConfirm.trim() !== dialog.name) {
      setDialogError("Name did not match.")
      return
    }
    setBusy(true)
    setDialogError(null)
    try {
      await deleteAdminCharacter({ characterName: dialog.name })
      setDialog(null)
      setDeleteConfirm("")
      await refreshChars()
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : "Delete failed")
    } finally {
      setBusy(false)
    }
  }

  const busyName = busy && dialog ? dialog.name : null
  const renameReady =
    dialog?.kind === "rename" &&
    renameValue.trim().length > 0 &&
    renameValue.trim() !== dialog.name
  const transferReady =
    dialog?.kind === "transfer" && transferValue.trim().length > 0
  const deleteReady =
    dialog?.kind === "delete" && deleteConfirm.trim() === dialog.name

  return (
    <div className="border border-border bg-muted/30 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-heading text-sm tracking-[0.14em] text-gold uppercase">
          Characters
        </h3>
        <span className="text-[0.7rem] text-muted-foreground">
          {isLoading
            ? "Loading…"
            : `${characters.length} in world DB`}
        </span>
      </div>
      {isError ? (
        <p className="mt-2 text-xs text-[#ff9b9b]">
          {error instanceof Error ? error.message : "Failed to load characters"}
        </p>
      ) : null}
      {!isLoading && !isError && characters.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No characters.</p>
      ) : null}
      {characters.length > 0 ? (
        <div className="mt-2 overflow-auto border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/80 text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 font-medium">Name</th>
                <th className="px-2 py-1.5 font-medium">Lv</th>
                <th className="px-2 py-1.5 font-medium">G</th>
                <th className="px-2 py-1.5 font-medium">Last</th>
                <th className="px-2 py-1.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {characters.map((c) => (
                <tr
                  key={c.name}
                  className="border-t border-border hover:bg-muted/40"
                >
                  <td className="px-2 py-1.5">
                    <Link
                      href={`/armory/${encodeURIComponent(c.name)}`}
                      className="font-medium text-gold-dim underline-offset-2 hover:text-gold-hot hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5">{c.level}</td>
                  <td className="px-2 py-1.5">
                    <GenderIcon gender={c.gender} />
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {formatLastLogin(c.lastLogin)}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={busyName === c.name}
                        onClick={() => openRename(c.name)}
                      >
                        Rename
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={busyName === c.name}
                        onClick={() => openTransfer(c.name)}
                      >
                        Transfer
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={busyName === c.name}
                        onClick={() => setInventoryName(c.name)}
                      >
                        Inventory
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="destructive"
                        disabled={busyName === c.name}
                        onClick={() => openDelete(c.name)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Dialog
        open={dialog?.kind === "rename"}
        onOpenChange={(open) => {
          if (!open) closeDialog()
        }}
      >
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>Rename character</DialogTitle>
            <DialogDescription>
              Character must be offline (not in lobby or world).
              {dialog?.kind === "rename" ? (
                <>
                  {" "}
                  Renaming{" "}
                  <span className="font-mono text-foreground">{dialog.name}</span>
                  .
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="char-rename-name">New name</FieldLabel>
              <Input
                id="char-rename-name"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                maxLength={32}
                autoComplete="off"
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    void submitRename()
                  }
                }}
              />
            </Field>
          </FieldGroup>
          {dialogError ? <FormAlert variant="error">{dialogError}</FormAlert> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={closeDialog}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || !renameReady}
              onClick={() => void submitRename()}
            >
              {busy ? "Renaming…" : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog?.kind === "transfer"}
        onOpenChange={(open) => {
          if (!open) closeDialog()
        }}
      >
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>Transfer character</DialogTitle>
            <DialogDescription>
              Move{" "}
              <span className="font-mono text-foreground">
                {dialog?.kind === "transfer" ? dialog.name : ""}
              </span>{" "}
              to another account. Both accounts must be offline; destination
              needs a free character slot.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="char-transfer-user">
                Destination username
              </FieldLabel>
              <Input
                id="char-transfer-user"
                value={transferValue}
                onChange={(e) => setTransferValue(e.target.value)}
                maxLength={32}
                autoComplete="off"
                disabled={busy}
                placeholder="username"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    void submitTransfer()
                  }
                }}
              />
            </Field>
          </FieldGroup>
          {dialogError ? <FormAlert variant="error">{dialogError}</FormAlert> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={closeDialog}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || !transferReady}
              onClick={() => void submitTransfer()}
            >
              {busy ? "Transferring…" : "Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog?.kind === "delete"}
        onOpenChange={(open) => {
          if (!open) closeDialog()
        }}
      >
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>Delete character?</DialogTitle>
            <DialogDescription>
              Immediate hard delete (not KillTime delay). This cannot be undone.
              Character must be offline. Type{" "}
              <span className="font-mono text-foreground">
                {dialog?.kind === "delete" ? dialog.name : ""}
              </span>{" "}
              to confirm.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="char-delete-confirm">Confirmation</FieldLabel>
              <Input
                id="char-delete-confirm"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                autoComplete="off"
                disabled={busy}
                placeholder={dialog?.kind === "delete" ? dialog.name : ""}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    void submitDelete()
                  }
                }}
              />
            </Field>
          </FieldGroup>
          {dialogError ? <FormAlert variant="error">{dialogError}</FormAlert> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={closeDialog}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={busy || !deleteReady}
              onClick={() => void submitDelete()}
            >
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CharacterInventoryDialog
        characterName={inventoryName}
        open={inventoryName != null}
        onOpenChange={(open) => {
          if (!open) setInventoryName(null)
        }}
      />
    </div>
  )
}
