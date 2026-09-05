export type AdminSqlPreset = {
  id: string
  label: string
  description: string
  sql: string
}

/** Common QA queries against world.sqlite3 (Macca = item 799; notes = 699 @ 50k). */
export const ADMIN_SQL_PRESETS: AdminSqlPreset[] = [
  {
    id: "top-macca",
    label: "Top Macca",
    description: "Characters with the most Macca (incl. 50k notes)",
    sql: `SELECT
  c.Name,
  COALESCE(SUM(CASE WHEN i.Type = 799 THEN i.StackSize ELSE 0 END), 0)
    + COALESCE(SUM(CASE WHEN i.Type = 699 THEN i.StackSize * 50000 ELSE 0 END), 0)
    AS Macca
FROM Character c
LEFT JOIN ItemBox ib ON ib.Character = c.UID
LEFT JOIN Item i ON i.ItemBox = ib.UID AND i.Type IN (799, 699)
GROUP BY c.UID, c.Name
ORDER BY Macca DESC
LIMIT 20`,
  },
  {
    id: "top-level",
    label: "Highest level",
    description: "Characters by level / XP",
    sql: `SELECT
  c.Name,
  e.Level,
  e.XP
FROM Character c
LEFT JOIN EntityStats e ON e.UID = c.CoreStats
ORDER BY e.Level DESC, e.XP DESC
LIMIT 20`,
  },
  {
    id: "tables",
    label: "List tables",
    description: "World DB table names",
    sql: `SELECT name AS table_name
FROM sqlite_master
WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
ORDER BY name COLLATE NOCASE`,
  },
]
