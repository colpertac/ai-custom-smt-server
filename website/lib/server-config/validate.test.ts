import { describe, expect, it } from "vitest"

import type { FieldDef, ObjgenDocument } from "./types"
import { validateObjgenDocument } from "./validate"

function field(name: string, extras: Partial<FieldDef> = {}): FieldDef {
  return {
    name,
    kind: "string",
    typeName: "string",
    required: false,
    ...extras,
  }
}

describe("validateObjgenDocument database block warnings", () => {
  it("warns when lobby/world schema has SQLite3Config but it is empty", () => {
    const doc: ObjgenDocument = {
      kind: "objgen",
      members: {
        DatabaseType: "SQLITE3",
        SQLite3Config: { __kind: "object", members: {} },
      },
      passthrough: [],
    }
    const fields = [
      field("DatabaseType", { kind: "enum" }),
      field("SQLite3Config", {
        kind: "object",
        typeName: "DatabaseConfigSQLite3*",
        pointer: true,
        children: [],
      }),
    ]
    const issues = validateObjgenDocument(doc, fields)
    expect(issues.some((i) => i.path === "SQLite3Config")).toBe(true)
  })

  it("does not warn for channel-like schemas without SQLite3Config field", () => {
    const doc: ObjgenDocument = {
      kind: "objgen",
      members: {
        DatabaseType: "SQLITE3",
        Name: "Some Channel",
      },
      passthrough: [],
    }
    const fields = [
      field("DatabaseType", { kind: "enum" }),
      field("Name"),
      field("ExternalIP"),
    ]
    const issues = validateObjgenDocument(doc, fields)
    expect(issues.filter((i) => i.path === "SQLite3Config")).toEqual([])
    expect(issues.filter((i) => i.path === "MariaDBConfig")).toEqual([])
  })

  it("warns for MARIADB only when MariaDBConfig is in the schema", () => {
    const doc: ObjgenDocument = {
      kind: "objgen",
      members: { DatabaseType: "MARIADB" },
      passthrough: [],
    }
    expect(
      validateObjgenDocument(doc, [field("DatabaseType", { kind: "enum" })])
    ).toEqual([])
    const withMaria = validateObjgenDocument(doc, [
      field("DatabaseType", { kind: "enum" }),
      field("MariaDBConfig", {
        kind: "object",
        typeName: "DatabaseConfigMariaDB*",
        pointer: true,
      }),
    ])
    expect(withMaria.some((i) => i.path === "MariaDBConfig")).toBe(true)
  })
})
