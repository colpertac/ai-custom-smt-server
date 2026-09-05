import { describe, expect, it } from "vitest"

import {
  ADMIN_SQL_MAX_LENGTH,
  assertReadOnlySelect,
  AdminSqlError,
  stripSqlComments,
} from "./admin-sql"

describe("stripSqlComments", () => {
  it("removes line and block comments", () => {
    expect(stripSqlComments("SELECT 1 -- hi\n")).toBe("SELECT 1")
    expect(stripSqlComments("SELECT /* x */ 1")).toBe("SELECT 1")
  })
})

describe("assertReadOnlySelect", () => {
  it("allows SELECT / WITH / EXPLAIN", () => {
    expect(assertReadOnlySelect("SELECT 1")).toBe("SELECT 1")
    expect(
      assertReadOnlySelect("WITH x AS (SELECT 1 AS n) SELECT * FROM x")
    ).toMatch(/^WITH /)
    expect(assertReadOnlySelect("EXPLAIN SELECT 1")).toMatch(/^EXPLAIN /)
    expect(assertReadOnlySelect("SELECT 1;")).toBe("SELECT 1")
  })

  it("rejects writes and multi-statements", () => {
    expect(() => assertReadOnlySelect("DELETE FROM Character")).toThrow(
      AdminSqlError
    )
    expect(() => assertReadOnlySelect("UPDATE Character SET Name='x'")).toThrow(
      AdminSqlError
    )
    expect(() =>
      assertReadOnlySelect("SELECT 1; DROP TABLE Character")
    ).toThrow(AdminSqlError)
    expect(() => assertReadOnlySelect("PRAGMA table_info(Character)")).toThrow(
      AdminSqlError
    )
    expect(() =>
      assertReadOnlySelect("SELECT 1; INSERT INTO Character DEFAULT VALUES")
    ).toThrow(AdminSqlError)
  })

  it("rejects comment-smuggled writes", () => {
    expect(() =>
      assertReadOnlySelect("SELECT 1; /* */ DELETE FROM Character")
    ).toThrow(AdminSqlError)
  })

  it("rejects empty and oversized queries", () => {
    expect(() => assertReadOnlySelect("   ")).toThrow(AdminSqlError)
    expect(() => assertReadOnlySelect("a".repeat(ADMIN_SQL_MAX_LENGTH + 1))).toThrow(
      AdminSqlError
    )
  })

  it("allows REPLACE() function but not REPLACE INTO", () => {
    expect(assertReadOnlySelect("SELECT REPLACE(Name, 'a', 'b') FROM Character")).toMatch(
      /^SELECT /
    )
    expect(() =>
      assertReadOnlySelect("REPLACE INTO Character (Name) VALUES ('x')")
    ).toThrow(AdminSqlError)
  })
})
