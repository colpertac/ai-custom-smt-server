/** Shared types for COMP objgen server-config editing (Lane A / 16I-3b). */

export type ConfigFileId =
  | "lobby"
  | "world"
  | "channel"
  | "setup"
  | "constants"
  | "newcharacter"

export type FieldKind =
  | "string"
  | "bool"
  | "number"
  | "enum"
  | "list"
  | "array"
  | "map"
  | "object"

export type FieldDef = {
  name: string
  kind: FieldKind
  /** Raw type token from schema (e.g. u16, WorldSharedConfig*). */
  typeName: string
  default?: string
  /** True when schema has no default and field is not an optional pointer. */
  required: boolean
  inherited?: boolean
  min?: number
  max?: number
  enumValues?: string[]
  /** Element schema for list/array. */
  element?: FieldDef
  keyType?: string
  valueField?: FieldDef
  /** Nested object members (pointer or embedded object). */
  children?: FieldDef[]
  /** Pointer types may be omitted entirely. */
  pointer?: boolean
  arraySize?: number
  /** Objgen regex attribute when present. */
  regex?: string
}

export type ConfigScalar = string | number | boolean | null

export type ConfigMapEntry = { key: string; value: ConfigValue }

export type ConfigMap = { __kind: "map"; entries: ConfigMapEntry[] }

export type ConfigObject = { __kind: "object"; members: Record<string, ConfigValue> }

export type ConfigValue =
  | ConfigScalar
  | ConfigValue[]
  | ConfigMap
  | ConfigObject

export type ConfigFileMeta = {
  id: ConfigFileId
  filename: string
  label: string
  description: string
  /** Process configs use objgen schema; siblings use specialized editors. */
  editor: "objgen" | "constants" | "setup" | "newcharacter"
  /** Which services to restart when this file is applied. */
  restart: Array<"lobby" | "world" | "channel">
  requiredToRun: boolean
}

export type ConfigFileStatus = {
  id: ConfigFileId
  filename: string
  label: string
  description: string
  editor: ConfigFileMeta["editor"]
  requiredToRun: boolean
  workingExists: boolean
  liveExists: boolean
  dirty: boolean
}

export type ObjgenDocument = {
  kind: "objgen"
  /** Root object member values (anonymous object for process configs). */
  members: Record<string, ConfigValue>
  /** Unknown members preserved as raw inner XML. */
  passthrough: { name: string; content: string }[]
}

export type ConstantsDocument = {
  kind: "constants"
  entries: { name: string; value: string }[]
}

export type SetupAccount = {
  members: Record<string, ConfigValue>
  passthrough: { name: string; content: string }[]
}

export type SetupDocument = {
  kind: "setup"
  accounts: SetupAccount[]
}

export type NewCharacterDocument = {
  kind: "newcharacter"
  /** Character object fields we edit. */
  character: Record<string, ConfigValue>
  characterPassthrough: { name: string; content: string }[]
  /** Other `<object name="…">` blocks kept verbatim. */
  otherObjectsXml: string[]
}

export type ConfigDocument =
  | ObjgenDocument
  | ConstantsDocument
  | SetupDocument
  | NewCharacterDocument
