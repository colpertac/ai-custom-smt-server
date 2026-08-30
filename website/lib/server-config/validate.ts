import type {
  ConfigDocument,
  ConfigMap,
  ConfigObject,
  ConfigValue,
  FieldDef,
  ObjgenDocument,
} from "./types.ts"

export type ValidationIssue = {
  /** Dotted path, e.g. ImportMaxPayload or WorldSharedConfig.LevelCap */
  path: string
  message: string
  severity: "error" | "warning"
}

export class ConfigValidationError extends Error {
  readonly issues: ValidationIssue[]

  constructor(issues: ValidationIssue[]) {
    const msg = issues
      .filter((i) => i.severity === "error")
      .map((i) => `${i.path}: ${i.message}`)
      .join("; ")
    super(msg || "Config validation failed")
    this.name = "ConfigValidationError"
    this.issues = issues
  }
}

function isMap(v: ConfigValue): v is ConfigMap {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    (v as ConfigMap).__kind === "map"
  )
}

function isObject(v: ConfigValue): v is ConfigObject {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    (v as ConfigObject).__kind === "object"
  )
}

function typeBounds(typeName: string): { min?: number; max?: number } {
  const bare = typeName.replace(/\*$/, "")
  switch (bare) {
    case "u8":
      return { min: 0, max: 255 }
    case "s8":
      return { min: -128, max: 127 }
    case "u16":
      return { min: 0, max: 65535 }
    case "s16":
      return { min: -32768, max: 32767 }
    case "u32":
      return { min: 0, max: 4294967295 }
    case "s32":
      return { min: -2147483648, max: 2147483647 }
    default:
      return {}
  }
}

function push(
  issues: ValidationIssue[],
  path: string,
  message: string,
  severity: "error" | "warning" = "error"
) {
  issues.push({ path, message, severity })
}

function validateScalar(
  path: string,
  value: ConfigValue,
  field: FieldDef,
  issues: ValidationIssue[]
) {
  if (value === null || value === undefined || value === "") {
    if (field.required) {
      push(issues, path, "Required field is empty")
    }
    return
  }

  if (field.kind === "bool") {
    if (typeof value !== "boolean") {
      push(issues, path, `Expected bool, got ${typeof value}`)
    }
    return
  }

  if (field.kind === "enum") {
    const s = String(value)
    if (field.enumValues?.length && !field.enumValues.includes(s)) {
      push(
        issues,
        path,
        `Invalid value "${s}"; allowed: ${field.enumValues.join(", ")}`
      )
    }
    return
  }

  if (field.kind === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      push(issues, path, `Expected number, got ${JSON.stringify(value)}`)
      return
    }
    const bounds = typeBounds(field.typeName)
    const min = field.min ?? bounds.min
    const max = field.max ?? bounds.max
    if (min != null && value < min) {
      push(issues, path, `Value ${value} is below minimum ${min}`)
    }
    if (max != null && value > max) {
      push(issues, path, `Value ${value} is above maximum ${max}`)
    }
    // Integer types should be whole numbers
    if (/^[su]?(8|16|32|64)$/.test(field.typeName.replace(/\*$/, ""))) {
      if (!Number.isInteger(value)) {
        push(issues, path, `Expected integer for type ${field.typeName}`)
      }
    }
    return
  }

  if (field.kind === "string") {
    if (typeof value !== "string" && typeof value !== "number") {
      push(issues, path, `Expected string, got ${typeof value}`)
      return
    }
    const s = String(value)
    if (field.regex) {
      try {
        const re = new RegExp(field.regex)
        if (!re.test(s)) {
          push(issues, path, `Does not match pattern ${field.regex}`)
        }
      } catch {
        /* ignore bad schema regex */
      }
    }
  }
}

function validateValue(
  path: string,
  value: ConfigValue | undefined,
  field: FieldDef,
  issues: ValidationIssue[]
) {
  if (value === undefined || value === null) {
    if (field.pointer) return
    if (field.kind === "object" && !field.pointer) {
      // non-pointer object may be omitted if all children optional
      return
    }
    if (field.required) {
      push(issues, path, "Required field is missing")
    }
    return
  }

  if (field.kind === "object" || field.pointer) {
    if (!isObject(value)) {
      // Allow plain record from partially coerced payloads
      if (typeof value === "object" && !Array.isArray(value) && !isMap(value)) {
        validateMembers(
          path,
          value as unknown as Record<string, ConfigValue>,
          field.children ?? [],
          issues
        )
        return
      }
      push(issues, path, "Expected nested object")
      return
    }
    validateMembers(path, value.members, field.children ?? [], issues)
    return
  }

  if (field.kind === "list" || field.kind === "array") {
    if (!Array.isArray(value)) {
      push(issues, path, "Expected a list of values")
      return
    }
    if (field.arraySize != null && value.length !== field.arraySize) {
      push(
        issues,
        path,
        `Expected exactly ${field.arraySize} elements, got ${value.length}`
      )
    }
    value.forEach((item, i) => {
      if (field.element) {
        validateValue(`${path}[${i}]`, item, field.element, issues)
      }
    })
    return
  }

  if (field.kind === "map") {
    if (!isMap(value)) {
      push(issues, path, "Expected a map (key=value entries)")
      return
    }
    value.entries.forEach((e, i) => {
      if (!e.key) {
        push(issues, `${path}[${i}]`, "Map entry is missing a key")
      }
      if (field.valueField) {
        validateValue(`${path}.${e.key || i}`, e.value, field.valueField, issues)
      }
    })
    return
  }

  validateScalar(path, value, field, issues)
}

export function validateMembers(
  prefix: string,
  members: Record<string, ConfigValue>,
  fields: FieldDef[],
  issues: ValidationIssue[]
) {
  const fieldByName = new Map(fields.map((f) => [f.name, f]))
  for (const field of fields) {
    const path = prefix ? `${prefix}.${field.name}` : field.name
    validateValue(path, members[field.name], field, issues)
  }
  // Unknown members are allowed (passthrough)
  void fieldByName
}

/** Schema validation for process configs (lobby/world/channel). */
export function validateObjgenDocument(
  doc: ObjgenDocument,
  fields: FieldDef[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  validateMembers("", doc.members, fields, issues)

  // Semantic: database backend vs config block
  const dbType = doc.members.DatabaseType
  if (dbType === "SQLITE3") {
    const sqlite = doc.members.SQLite3Config
    if (
      sqlite == null ||
      (isObject(sqlite) && Object.keys(sqlite.members).length === 0)
    ) {
      push(
        issues,
        "SQLite3Config",
        "DatabaseType is SQLITE3 but SQLite3Config is missing or empty",
        "warning"
      )
    }
  }
  if (dbType === "MARIADB") {
    const maria = doc.members.MariaDBConfig
    if (
      maria == null ||
      (isObject(maria) && Object.keys(maria.members).length === 0)
    ) {
      push(
        issues,
        "MariaDBConfig",
        "DatabaseType is MARIADB but MariaDBConfig is missing or empty",
        "warning"
      )
    }
  }

  const port = doc.members.Port
  if (typeof port === "number" && (port < 1 || port > 65535)) {
    push(issues, "Port", `Port ${port} is outside 1–65535`)
  }

  return issues
}

export function validateConfigDocument(
  doc: ConfigDocument,
  fields?: FieldDef[] | null
): ValidationIssue[] {
  if (doc.kind === "objgen") {
    return validateObjgenDocument(doc, fields ?? [])
  }

  const issues: ValidationIssue[] = []

  if (doc.kind === "constants") {
    const seen = new Set<string>()
    doc.entries.forEach((e, i) => {
      if (!e.name.trim()) {
        push(issues, `entries[${i}]`, "Constant name is empty")
      } else if (seen.has(e.name)) {
        push(issues, e.name, "Duplicate constant name")
      } else {
        seen.add(e.name)
      }
    })
    return issues
  }

  if (doc.kind === "setup") {
    if (!doc.accounts.length) {
      push(issues, "accounts", "No Account objects", "warning")
    }
    doc.accounts.forEach((a, i) => {
      const u = a.members.Username
      if (u == null || String(u).trim() === "") {
        push(issues, `accounts[${i}].Username`, "Username is required")
      }
    })
    return issues
  }

  if (doc.kind === "newcharacter") {
    const zone = doc.character.HomepointZone
    if (zone == null || zone === "") {
      push(issues, "HomepointZone", "HomepointZone is required", "warning")
    } else if (typeof zone === "number" && zone < 0) {
      push(issues, "HomepointZone", "HomepointZone must be >= 0")
    }
    return issues
  }

  return issues
}

export function assertNoValidationErrors(issues: ValidationIssue[]): void {
  const errors = issues.filter((i) => i.severity === "error")
  if (errors.length) throw new ConfigValidationError(errors)
}
