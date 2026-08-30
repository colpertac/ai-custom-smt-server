/**
 * Lane A config publish — validate / apply / rollback against runtime/config.
 *
 *   pnpm run publish-lane-a-config -- --validate --json
 *   pnpm run publish-lane-a-config -- --apply <releaseId> --json
 *   pnpm run publish-lane-a-config -- --rollback [--release <id>] --json
 *
 * Env: OPS_RUNTIME, COMP_CONFIG_DIR, COMP_CONFIG_LIVE_DIR, COMP_HACK_ROOT
 */
import {
  applyLaneAConfig,
  publishLaneAConfig,
  rollbackLaneAConfig,
  validateLaneAConfig,
} from "../lib/server-config/lane-a-config-publish.ts"
import type { ConfigFileId } from "../lib/server-config/types.ts"

const args = process.argv.slice(2)
const json = args.includes("--json")
const validateOnly = args.includes("--validate")
const applyIdx = args.indexOf("--apply")
const rollback = args.includes("--rollback")
const releaseFlag = args.indexOf("--release")
const onlyIdx = args.indexOf("--only")

function parseOnly(): ConfigFileId[] | undefined {
  if (onlyIdx < 0) return undefined
  const raw = args[onlyIdx + 1]
  if (!raw || raw.startsWith("-")) return undefined
  return raw.split(",").map((s) => s.trim()).filter(Boolean) as ConfigFileId[]
}

function printResult(result: {
  ok: boolean
  phase: string
  releaseId?: string
  filesCopied: number
  files: string[]
  restart: string[]
  warnings: string[]
  errors?: string[]
  error?: string
  configDest: string
}) {
  if (json) {
    console.log(JSON.stringify(result))
    return
  }
  if (!result.ok) {
    console.error(result.error ?? result.errors?.join("; ") ?? "failed")
    for (const w of result.warnings) console.error(`warn: ${w}`)
    for (const e of result.errors ?? []) console.error(`error: ${e}`)
    return
  }
  console.log(
    `Lane A config ${result.phase}${result.releaseId ? ` [${result.releaseId}]` : ""}: ${result.filesCopied} file(s)`
  )
  console.log(`files: ${result.files.join(", ") || "(none)"}`)
  console.log(`restart: ${result.restart.join(", ") || "(none)"}`)
  console.log(`config → ${result.configDest}`)
  for (const w of result.warnings) console.log(`warn: ${w}`)
}

const only = parseOnly()
let result
if (validateOnly) {
  result = await validateLaneAConfig(only)
} else if (applyIdx >= 0) {
  const id = args[applyIdx + 1]
  if (!id || id.startsWith("-")) {
    console.error("usage: --apply <releaseId>")
    process.exit(2)
  }
  result = await applyLaneAConfig(id)
} else if (rollback) {
  const id =
    releaseFlag >= 0 &&
    args[releaseFlag + 1] &&
    !args[releaseFlag + 1].startsWith("-")
      ? args[releaseFlag + 1]
      : undefined
  result = await rollbackLaneAConfig(id)
} else {
  result = await publishLaneAConfig(only)
}

printResult(result)
process.exit(result.ok ? 0 : 1)
