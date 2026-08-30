"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ConfigSearchInput } from "@/features/admin-config/components/ConfigSearchInput"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  applyAdminConfigPublish,
  ConfigSaveError,
  fetchAdminConfig,
  fetchAdminConfigList,
  rollbackAdminConfigPublish,
  saveAdminConfig,
  validateAdminConfigPublish,
} from "@/features/admin-config/api"
import { ObjgenFieldForm } from "@/features/admin-config/components/ObjgenFieldForm"
import {
  NEWCHAR_FIELD_HELP,
  SETUP_FIELD_HELP,
} from "@/lib/server-config/field-help"
import {
  CONSTANT_CATEGORIES,
  countByCategory,
  filterConstantsByCategory,
  type ConstantCategoryId,
} from "@/lib/server-config/constants-categories"
import {
  SIMPLE_FIELDS,
  supportsSimpleMode,
} from "@/lib/server-config/simple-mode"
import { ACCOUNT_FIELDS } from "@/lib/server-config/setup-xml"
import type {
  ConfigDocument,
  ConfigFileId,
  ConfigFileStatus,
  ConstantsDocument,
  FieldDef,
  NewCharacterDocument,
  ObjgenDocument,
  SetupDocument,
} from "@/lib/server-config/types"

type PublishPhase =
  | "idle"
  | "validating"
  | "applying"
  | "done"
  | "failed"

export function ServerConfigPanel() {
  const [files, setFiles] = useState<ConfigFileStatus[]>([])
  const [tab, setTab] = useState("lobby")
  const [document, setDocument] = useState<ConfigDocument | null>(null)
  const [fields, setFields] = useState<FieldDef[] | null>(null)
  const [baseline, setBaseline] = useState("")
  const [filter, setFilter] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishPhase, setPublishPhase] = useState<PublishPhase>("idle")
  const [lastReleaseId, setLastReleaseId] = useState<string | null>(null)
  const [constFilter, setConstFilter] = useState("")
  const [validating, setValidating] = useState(false)
  const [fieldIssues, setFieldIssues] = useState<string[]>([])
  const [simpleMode, setSimpleMode] = useState(true)
  const [constCategory, setConstCategory] = useState<ConstantCategoryId>("all")

  const dirty = useMemo(() => {
    if (!document) return false
    return JSON.stringify(document) !== baseline
  }, [document, baseline])

  const refreshList = useCallback(async () => {
    const data = await fetchAdminConfigList()
    setFiles(data.files)
  }, [])

  const loadTab = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    setOk(null)
    try {
      const data = await fetchAdminConfig(id)
      setDocument(data.document)
      setFields(data.fields)
      setBaseline(JSON.stringify(data.document))
      await refreshList()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load")
      setDocument(null)
    } finally {
      setLoading(false)
    }
  }, [refreshList])

  useEffect(() => {
    void loadTab(tab)
  }, [tab, loadTab])

  const save = async () => {
    if (!document) return
    setSaving(true)
    setError(null)
    setOk(null)
    setFieldIssues([])
    try {
      const result = await saveAdminConfig(tab, document)
      setBaseline(JSON.stringify(document))
      const warnText = result.warnings.length
        ? ` (${result.warnings.map((w) => `${w.path}: ${w.message}`).join("; ")})`
        : ""
      setOk(`Saved to working copy (schema OK)${warnText}`)
      await refreshList()
    } catch (e) {
      if (e instanceof ConfigSaveError) {
        setFieldIssues(
          e.issues.map((i) => `${i.path}: ${i.message}`)
        )
        setError(e.message || "Schema validation failed")
      } else {
        setError(e instanceof Error ? e.message : "Save failed")
      }
    } finally {
      setSaving(false)
    }
  }

  const validateDeploy = async () => {
    setValidating(true)
    setError(null)
    setOk(null)
    setFieldIssues([])
    try {
      if (dirty && document) {
        await saveAdminConfig(tab, document)
        setBaseline(JSON.stringify(document))
      }
      const validated = await validateAdminConfigPublish()
      setLastReleaseId(validated.releaseId ?? null)
      const bits = [
        "Deploy validation passed (staged candidate, live untouched)",
        validated.releaseId ? `release ${validated.releaseId}` : null,
        validated.files?.length ? validated.files.join(", ") : null,
        validated.restart?.length
          ? `would restart ${validated.restart.join(", ")}`
          : null,
      ].filter(Boolean)
      const warn = validated.warnings?.length
        ? ` — warnings: ${validated.warnings.join("; ")}`
        : ""
      setOk(`${bits.join(" — ")}${warn}`)
      await refreshList()
    } catch (e) {
      if (e instanceof ConfigSaveError) {
        setFieldIssues(e.issues.map((i) => `${i.path}: ${i.message}`))
        setError(e.message || "Schema validation failed before deploy check")
      } else {
        setError(e instanceof Error ? e.message : "Validate failed")
      }
    } finally {
      setValidating(false)
    }
  }

  const publish = async () => {
    setPublishOpen(false)
    setPublishPhase("validating")
    setError(null)
    setOk(null)
    try {
      if (dirty) {
        await saveAdminConfig(tab, document!)
        setBaseline(JSON.stringify(document))
      }
      const validated = await validateAdminConfigPublish()
      if (!validated.releaseId) {
        setPublishPhase("failed")
        setError("Validation returned no releaseId")
        return
      }
      setLastReleaseId(validated.releaseId)
      setPublishPhase("applying")
      const applied = await applyAdminConfigPublish(validated.releaseId, true)
      setPublishPhase("done")
      const parts = [
        applied.message || "Config applied",
        applied.files?.length ? applied.files.join(", ") : null,
        applied.restart?.length
          ? `restarted ${applied.restart.join(", ")}`
          : null,
      ].filter(Boolean)
      setOk(parts.join(" — "))
      await refreshList()
      await loadTab(tab)
    } catch (e) {
      setPublishPhase("failed")
      setError(e instanceof Error ? e.message : "Publish failed")
    } finally {
      setTimeout(() => {
        setPublishPhase((p) => (p === "done" || p === "failed" ? "idle" : p))
      }, 800)
    }
  }

  const rollback = async () => {
    setError(null)
    setOk(null)
    try {
      const result = await rollbackAdminConfigPublish(
        lastReleaseId ?? undefined
      )
      setOk(result.message || "Config rolled back")
      await refreshList()
      await loadTab(tab)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rollback failed")
    }
  }

  const statusFor = (id: string) => files.find((f) => f.id === id)

  const publishing =
    publishPhase === "validating" || publishPhase === "applying"

  return (
    <div className="mt-6">
      {error ? <FormAlert variant="error">{error}</FormAlert> : null}
      {fieldIssues.length ? (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-destructive">
          {fieldIssues.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {ok ? <FormAlert variant="success">{ok}</FormAlert> : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={!document || saving || !dirty}
          onClick={() => void save()}
        >
          {saving ? "Validating…" : "Save working copy"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={publishing || loading || validating}
          onClick={() => void validateDeploy()}
        >
          {validating ? "Checking deploy…" : "Validate deploy"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={publishing || loading || validating}
          onClick={() => setPublishOpen(true)}
        >
          {publishing
            ? publishPhase === "validating"
              ? "Validating…"
              : "Applying…"
            : "Apply & restart"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={publishing || validating}
          onClick={() => void rollback()}
        >
          Rollback last apply
        </Button>
        {supportsSimpleMode(tab) ? (
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Advanced</span>
            <Switch
              checked={simpleMode}
              onCheckedChange={setSimpleMode}
              aria-label="Simple mode"
            />
            <span>
              Simple
              <span className="ml-1 text-xs text-muted-foreground">
                (gameplay)
              </span>
            </span>
          </div>
        ) : null}
        <p className="w-full text-xs text-muted-foreground">
          <strong className="font-medium text-foreground">Save</strong> runs
          schema checks (min/max, types, enums).{" "}
          <strong className="font-medium text-foreground">Validate deploy</strong>{" "}
          stages a Lane A candidate under{" "}
          <code className="text-xs">runtime/releases/lane-a-config/</code>{" "}
          (schema + port collision checks; live config untouched).{" "}
          <strong className="font-medium text-foreground">Apply &amp; restart</strong>{" "}
          copies that candidate live and restarts processes.
          {supportsSimpleMode(tab) && simpleMode ? (
            <>
              {" "}
              Simple mode hides infra fields (ports, logs, DH keys, DB). Switch
              off for the full schema.
            </>
          ) : null}
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList variant="line" className="mb-4 flex h-auto flex-wrap gap-1">
          {files.length
            ? files.map((f) => (
                <TabsTrigger key={f.id} value={f.id} className="px-2.5">
                  {f.label}
                  {f.dirty ? (
                    <span className="ml-1 text-amber-600" title="Differs from live">
                      ●
                    </span>
                  ) : null}
                </TabsTrigger>
              ))
            : ["lobby", "world", "channel", "setup", "constants", "newcharacter"].map(
                (id) => (
                  <TabsTrigger key={id} value={id} className="px-2.5">
                    {id}
                  </TabsTrigger>
                )
              )}
        </TabsList>

        {(files.length
          ? files
          : [
              { id: "lobby", description: "" },
              { id: "world", description: "" },
              { id: "channel", description: "" },
              { id: "setup", description: "" },
              { id: "constants", description: "" },
              { id: "newcharacter", description: "" },
            ]
        ).map((f) => (
          <TabsContent key={f.id} value={f.id} className="mt-0">
            <p className="mb-3 text-sm text-muted-foreground">
              {statusFor(f.id)?.description || f.description}
              {statusFor(f.id)?.dirty ? (
                <span className="ml-2 text-amber-700">
                  (working copy differs from live)
                </span>
              ) : null}
            </p>

            {loading && tab === f.id ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : null}

            {!loading && tab === f.id && document ? (
              <>
                {document.kind === "objgen" && fields ? (
                  <>
                    <div className="mb-4">
                      <ConfigSearchInput
                        value={filter}
                        onChange={setFilter}
                        placeholder="Search fields (name or description)…"
                        aria-label="Search config fields"
                      />
                    </div>
                    <ObjgenFieldForm
                      fields={fields}
                      values={(document as ObjgenDocument).members}
                      filter={filter}
                      includeNames={
                        simpleMode && supportsSimpleMode(tab)
                          ? SIMPLE_FIELDS[tab as ConfigFileId]
                          : null
                      }
                      onChange={(members) =>
                        setDocument({
                          ...(document as ObjgenDocument),
                          members,
                        })
                      }
                    />
                  </>
                ) : null}

                {document.kind === "constants" ? (
                  <ConstantsEditor
                    doc={document as ConstantsDocument}
                    filter={constFilter}
                    onFilter={setConstFilter}
                    category={constCategory}
                    onCategory={setConstCategory}
                    onChange={setDocument}
                  />
                ) : null}

                {document.kind === "setup" ? (
                  <SetupEditor
                    doc={document as SetupDocument}
                    onChange={setDocument}
                  />
                ) : null}

                {document.kind === "newcharacter" ? (
                  <NewCharacterEditor
                    doc={document as NewCharacterDocument}
                    onChange={setDocument}
                  />
                ) : null}
              </>
            ) : null}
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply server config?</DialogTitle>
            <DialogDescription>
              Copies the working-copy XMLs into live{" "}
              <code className="text-xs">runtime/config/</code> and restarts
              lobby / world / channel as needed. Players on those processes will
              be disconnected.
              {dirty ? " Unsaved edits on this tab will be saved first." : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPublishOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void publish()}>
              Apply & restart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ConstantsEditor({
  doc,
  filter,
  onFilter,
  category,
  onCategory,
  onChange,
}: {
  doc: ConstantsDocument
  filter: string
  onFilter: (v: string) => void
  category: ConstantCategoryId
  onCategory: (c: ConstantCategoryId) => void
  onChange: (d: ConfigDocument) => void
}) {
  const counts = useMemo(() => countByCategory(doc.entries), [doc.entries])
  const q = filter.trim().toLowerCase()

  const entries = useMemo(() => {
    const byCat = filterConstantsByCategory(doc.entries, category)
    if (!q) return byCat
    return byCat.filter(
      (e) =>
        e.name.toLowerCase().includes(q) || e.value.toLowerCase().includes(q)
    )
  }, [doc.entries, category, q])

  const setEntry = (name: string, value: string) => {
    onChange({
      ...doc,
      entries: doc.entries.map((e) =>
        e.name === name ? { ...e, value } : e
      ),
    })
  }

  return (
    <div>
      <Tabs
        value={category}
        onValueChange={(v) => onCategory(v as ConstantCategoryId)}
      >
        <TabsList variant="line" className="mb-3 flex h-auto flex-wrap gap-1">
          {CONSTANT_CATEGORIES.map((c) => (
            <TabsTrigger key={c.id} value={c.id} className="px-2.5">
              {c.label}
              <span className="ml-1 text-[0.65rem] text-muted-foreground tabular-nums">
                {counts[c.id]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mb-4">
        <ConfigSearchInput
          value={filter}
          onChange={onFilter}
          placeholder="Search within this category…"
          aria-label="Search constants"
        />
      </div>
      <div className="max-h-[32rem] overflow-auto rounded-md border border-border/60">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b border-border/60">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.name} className="border-b border-border/40">
                <td className="px-3 py-1.5 font-mono text-xs">{e.name}</td>
                <td className="px-3 py-1.5">
                  <Input
                    className="h-7 font-mono text-xs"
                    value={e.value}
                    onChange={(ev) => setEntry(e.name, ev.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Showing {entries.length}
        {category === "all" ? ` of ${doc.entries.length}` : null}
        {q ? " (search filtered)" : null}
      </p>
    </div>
  )
}

function SetupEditor({
  doc,
  onChange,
}: {
  doc: SetupDocument
  onChange: (d: ConfigDocument) => void
}) {
  const updateAccount = (
    index: number,
    name: string,
    value: string | number | boolean
  ) => {
    const accounts = doc.accounts.map((a, i) => {
      if (i !== index) return a
      return {
        ...a,
        members: { ...a.members, [name]: value },
      }
    })
    onChange({ ...doc, accounts })
  }

  return (
    <div className="flex flex-col gap-6">
      {doc.accounts.map((acct, i) => (
        <fieldset
          key={i}
          className="rounded-md border border-border/60 p-4"
        >
          <legend className="px-1 text-sm font-medium">
            Account {String(acct.members.Username ?? i + 1)}
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {ACCOUNT_FIELDS.map((name) => {
              const v = acct.members[name]
              if (name === "Enabled" || name === "IsGM") {
                return (
                  <Field key={name}>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={v === true}
                        onChange={(e) =>
                          updateAccount(i, name, e.target.checked)
                        }
                      />
                      {name}
                    </label>
                    {SETUP_FIELD_HELP[name] ? (
                      <FieldDescription>
                        {SETUP_FIELD_HELP[name]}
                      </FieldDescription>
                    ) : null}
                  </Field>
                )
              }
              return (
                <Field key={name}>
                  <FieldLabel>{name}</FieldLabel>
                  <Input
                    type={
                      name === "CP" ||
                      name === "TicketCount" ||
                      name === "UserLevel"
                        ? "number"
                        : name === "Password"
                          ? "password"
                          : "text"
                    }
                    value={v == null ? "" : String(v)}
                    onChange={(e) => {
                      const raw = e.target.value
                      if (
                        name === "CP" ||
                        name === "TicketCount" ||
                        name === "UserLevel"
                      ) {
                        const n = Number(raw)
                        updateAccount(i, name, Number.isFinite(n) ? n : raw)
                      } else {
                        updateAccount(i, name, raw)
                      }
                    }}
                  />
                  {SETUP_FIELD_HELP[name] ? (
                    <FieldDescription>{SETUP_FIELD_HELP[name]}</FieldDescription>
                  ) : null}
                </Field>
              )
            })}
          </div>
        </fieldset>
      ))}
      {!doc.accounts.length ? (
        <p className="text-sm text-muted-foreground">No Account objects.</p>
      ) : null}
    </div>
  )
}

function NewCharacterEditor({
  doc,
  onChange,
}: {
  doc: NewCharacterDocument
  onChange: (d: ConfigDocument) => void
}) {
  const setChar = (name: string, value: string | number | (string | number)[]) => {
    onChange({
      ...doc,
      character: { ...doc.character, [name]: value },
    })
  }

  const skills = Array.isArray(doc.character.LearnedSkills)
    ? (doc.character.LearnedSkills as (string | number)[]).join("\n")
    : ""

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <Field>
        <FieldLabel>HomepointZone</FieldLabel>
        <Input
          type="number"
          value={String(doc.character.HomepointZone ?? "")}
          onChange={(e) => setChar("HomepointZone", Number(e.target.value))}
        />
        <FieldDescription>{NEWCHAR_FIELD_HELP.HomepointZone}</FieldDescription>
      </Field>
      <Field>
        <FieldLabel>HomepointSpotID</FieldLabel>
        <Input
          type="number"
          value={String(doc.character.HomepointSpotID ?? "")}
          onChange={(e) => setChar("HomepointSpotID", Number(e.target.value))}
        />
        <FieldDescription>
          {NEWCHAR_FIELD_HELP.HomepointSpotID}
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel>LearnedSkills</FieldLabel>
        <textarea
          className="min-h-40 w-full rounded-md border border-input bg-transparent px-2 py-1.5 font-mono text-xs"
          value={skills}
          onChange={(e) =>
            setChar(
              "LearnedSkills",
              e.target.value
                .split(/[\n,]+/)
                .map((s) => s.trim())
                .filter(Boolean)
                .map((s) => {
                  const n = Number(s)
                  return Number.isFinite(n) ? n : s
                })
            )
          }
        />
        <FieldDescription>{NEWCHAR_FIELD_HELP.LearnedSkills}</FieldDescription>
      </Field>
      <p className="text-xs text-muted-foreground">
        Other Character members and {doc.otherObjectsXml.length} non-Character
        object(s) are preserved on save.
      </p>
    </div>
  )
}
