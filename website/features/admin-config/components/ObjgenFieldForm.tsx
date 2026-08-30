"use client"

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { fieldHelpOrFallback } from "@/lib/server-config/field-help"
import type {
  ConfigMap,
  ConfigObject,
  ConfigValue,
  FieldDef,
} from "@/lib/server-config/types"

function isMap(v: ConfigValue | undefined): v is ConfigMap {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    (v as ConfigMap).__kind === "map"
  )
}

function isObject(v: ConfigValue | undefined): v is ConfigObject {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    (v as ConfigObject).__kind === "object"
  )
}

function mapToText(v: ConfigValue | undefined): string {
  if (!isMap(v)) return ""
  return v.entries.map((e) => `${e.key}=${String(e.value ?? "")}`).join("\n")
}

function listToText(v: ConfigValue | undefined): string {
  if (!Array.isArray(v)) return ""
  return v.map((x) => String(x ?? "")).join("\n")
}

function textToList(text: string, field: FieldDef): ConfigValue {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      if (field.element?.kind === "number") {
        const n = Number(s)
        return Number.isFinite(n) ? n : s
      }
      if (field.element?.kind === "bool") return s === "true"
      return s
    })
}

function textToMap(text: string): ConfigMap {
  const entries = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const eq = line.indexOf("=")
      if (eq < 0) return { key: line, value: "" as ConfigValue }
      return {
        key: line.slice(0, eq).trim(),
        value: line.slice(eq + 1).trim(),
      }
    })
  return { __kind: "map", entries }
}

function typeMeta(field: FieldDef): string {
  return [
    field.typeName,
    field.default != null ? `default ${field.default}` : null,
    field.min != null ? `min ${field.min}` : null,
    field.max != null ? `max ${field.max}` : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

function FieldHelp({ field }: { field: FieldDef }) {
  return (
    <FieldDescription>
      <span className="block text-muted-foreground">
        {fieldHelpOrFallback(field.name)}
      </span>
      <span className="mt-0.5 block font-mono text-[0.65rem] text-muted-foreground/80">
        {typeMeta(field)}
      </span>
    </FieldDescription>
  )
}

type Props = {
  fields: FieldDef[]
  values: Record<string, ConfigValue>
  onChange: (values: Record<string, ConfigValue>) => void
  filter?: string
  /** When set, only these top-level field names are shown (Simple mode). */
  includeNames?: readonly string[] | null
}

export function ObjgenFieldForm({
  fields,
  values,
  onChange,
  filter,
  includeNames,
}: Props) {
  const q = filter?.trim().toLowerCase() ?? ""

  const setField = (name: string, value: ConfigValue | undefined) => {
    const next = { ...values }
    if (value === undefined) delete next[name]
    else next[name] = value
    onChange(next)
  }

  const scoped = includeNames?.length
    ? fields.filter((f) => includeNames.includes(f.name))
    : fields

  const matches = (f: FieldDef): boolean => {
    if (!q) return true
    if (f.name.toLowerCase().includes(q)) return true
    if (f.typeName.toLowerCase().includes(q)) return true
    if (fieldHelpOrFallback(f.name).toLowerCase().includes(q)) return true
    return (f.children ?? []).some(matches)
  }

  const visible = q ? scoped.filter(matches) : scoped

  return (
    <div className="flex flex-col gap-4">
      {visible.map((field) => (
        <FieldRow
          key={field.name}
          field={field}
          value={values[field.name]}
          onChange={(v) => setField(field.name, v)}
          filter={filter}
        />
      ))}
      {!visible.length ? (
        <p className="text-sm text-muted-foreground">No fields match search.</p>
      ) : null}
    </div>
  )
}

function FieldRow({
  field,
  value,
  onChange,
  filter,
}: {
  field: FieldDef
  value: ConfigValue | undefined
  onChange: (v: ConfigValue | undefined) => void
  filter?: string
}) {
  const badge = field.required ? (
    <span className="ml-2 text-[0.65rem] tracking-wide text-amber-600/90 uppercase">
      required
    </span>
  ) : field.min != null || field.max != null ? (
    <span className="ml-2 text-[0.65rem] tracking-wide text-muted-foreground uppercase">
      constrained
    </span>
  ) : null

  if (field.kind === "object" || field.pointer) {
    const present = isObject(value)
    const members = present ? value.members : {}
    return (
      <fieldset className="rounded-md border border-border/60 p-3">
        <legend className="px-1 text-sm font-medium">
          {field.name}
          {badge}
        </legend>
        <p className="mb-1 text-xs text-muted-foreground">
          {fieldHelpOrFallback(field.name)}
        </p>
        <p className="mb-2 font-mono text-[0.65rem] text-muted-foreground/80">
          {typeMeta(field)}
        </p>
        {field.pointer ? (
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={present}
              onChange={(e) => {
                if (e.target.checked) {
                  onChange({ __kind: "object", members: {} })
                } else {
                  onChange(undefined)
                }
              }}
            />
            Include {field.name}
          </label>
        ) : null}
        {present || !field.pointer ? (
          <ObjgenFieldForm
            fields={field.children ?? []}
            values={members}
            filter={filter}
            onChange={(members) => onChange({ __kind: "object", members })}
          />
        ) : null}
      </fieldset>
    )
  }

  if (field.kind === "bool") {
    return (
      <Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>
            {field.name}
            {badge}
          </span>
        </label>
        <FieldHelp field={field} />
      </Field>
    )
  }

  if (field.kind === "enum" && field.enumValues?.length) {
    return (
      <Field>
        <FieldLabel>
          {field.name}
          {badge}
        </FieldLabel>
        <select
          className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          value={value == null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">(unset)</option>
          {field.enumValues.map((ev) => (
            <option key={ev} value={ev}>
              {ev}
            </option>
          ))}
        </select>
        <FieldHelp field={field} />
      </Field>
    )
  }

  if (field.kind === "list" || field.kind === "array") {
    return (
      <Field>
        <FieldLabel>
          {field.name}
          {badge}
        </FieldLabel>
        <textarea
          className="min-h-20 w-full rounded-md border border-input bg-transparent px-2 py-1.5 font-mono text-xs"
          value={listToText(value)}
          onChange={(e) => onChange(textToList(e.target.value, field))}
          placeholder="One value per line"
        />
        <FieldHelp field={field} />
      </Field>
    )
  }

  if (field.kind === "map") {
    return (
      <Field>
        <FieldLabel>
          {field.name}
          {badge}
        </FieldLabel>
        <textarea
          className="min-h-20 w-full rounded-md border border-input bg-transparent px-2 py-1.5 font-mono text-xs"
          value={mapToText(value)}
          onChange={(e) => onChange(textToMap(e.target.value))}
          placeholder="key=value per line"
        />
        <FieldHelp field={field} />
      </Field>
    )
  }

  return (
    <Field>
      <FieldLabel>
        {field.name}
        {badge}
      </FieldLabel>
      <Input
        type={field.kind === "number" ? "number" : "text"}
        value={value == null ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value
          if (raw === "") {
            onChange(null)
            return
          }
          if (field.kind === "number") {
            const n = Number(raw)
            onChange(Number.isFinite(n) ? n : raw)
            return
          }
          onChange(raw)
        }}
        min={field.min}
        max={field.max}
        step={
          field.typeName.includes("float") || field.typeName === "f32"
            ? "any"
            : undefined
        }
      />
      <FieldHelp field={field} />
    </Field>
  )
}
