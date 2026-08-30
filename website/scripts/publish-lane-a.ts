/**
 * Lane A publish — validate / apply / rollback against runtime datastore.
 *
 *   pnpm run publish-lane-a
 *   pnpm run publish-lane-a -- --validate --json
 *   pnpm run publish-lane-a -- --apply <releaseId> --json
 *   pnpm run publish-lane-a -- --rollback [--release <id>] --json
 *   pnpm run publish-lane-a -- --retire-conflicts --json
 *
 * Env: OPS_RUNTIME, OPS_RELEASES_DIR, COMP_SHOPS_DIR, COMP_PAYOUTS_DIR
 */
import {
  applyLaneA,
  listPayoutLiveConflicts,
  publishLaneA,
  retirePackagesBlockingLaneA,
  rollbackLaneA,
  validateLaneA,
} from "../lib/lane-a-publish.ts"

const args = process.argv.slice(2)
const json = args.includes("--json")
const validateOnly = args.includes("--validate")
const applyIdx = args.indexOf("--apply")
const rollback = args.includes("--rollback")
const retireConflicts = args.includes("--retire-conflicts")
const releaseFlag = args.indexOf("--release")

function printResult(result: {
  ok: boolean
  phase: string
  releaseId?: string
  shopsCopied: number
  payoutsPackaged: number
  reportRewardsPackaged: number
  warnings: string[]
  errors?: string[]
  error?: string
  shopsDest: string
  payoutsZipPath: string
  reportRewardsZipPath: string
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
    `Lane A ${result.phase}${result.releaseId ? ` [${result.releaseId}]` : ""}: ${result.shopsCopied} shop(s), ${result.payoutsPackaged} payout(s), ${result.reportRewardsPackaged} report-reward pack(s)`
  )
  console.log(`shops → ${result.shopsDest}`)
  console.log(`payouts → ${result.payoutsZipPath}`)
  console.log(`report rewards → ${result.reportRewardsZipPath}`)
  for (const w of result.warnings) console.log(`warn: ${w}`)
}

if (retireConflicts) {
  const retired = await retirePackagesBlockingLaneA()
  const remaining = await listPayoutLiveConflicts()
  if (json) {
    console.log(JSON.stringify({ ...retired, remaining }))
  } else {
    console.log(
      retired.retired.length
        ? `Retired: ${retired.retired.join(", ")}`
        : "No packages retired"
    )
    if (retired.skipped.length) {
      console.error(`Skipped: ${retired.skipped.join(", ")}`)
    }
    if (remaining.length) {
      console.error(
        `Still conflicting: ${remaining.map((c) => c.payoutId).join(", ")}`
      )
    }
  }
  process.exit(retired.skipped.length || remaining.length ? 1 : 0)
}

let result
if (validateOnly) {
  result = await validateLaneA()
} else if (applyIdx >= 0) {
  const id = args[applyIdx + 1]
  if (!id || id.startsWith("-")) {
    console.error("usage: --apply <releaseId>")
    process.exit(2)
  }
  result = await applyLaneA(id)
} else if (rollback) {
  const id =
    releaseFlag >= 0 && args[releaseFlag + 1] && !args[releaseFlag + 1].startsWith("-")
      ? args[releaseFlag + 1]
      : undefined
  result = await rollbackLaneA(id)
} else {
  result = await publishLaneA()
}

printResult(result)
process.exit(result.ok ? 0 : 1)
