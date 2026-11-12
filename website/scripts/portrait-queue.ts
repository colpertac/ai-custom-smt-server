/**
 * Portrait queue CLI (portraits.db). The render worker (avatar/worker) claims and renders jobs;
 * this is for inspecting the queue and fixing it by hand.
 *
 *   pnpm portrait-queue
 *   pnpm portrait-queue -- complete <fingerprint>
 *   pnpm portrait-queue -- ingest <png> <fingerprint>
 *   pnpm portrait-queue -- fail <fingerprint> <reason>
 *   pnpm portrait-queue -- clear          # wipe hash PNGs + queue DB
 *   pnpm portrait-queue -- clear --stubs  # also delete other PNGs (legacy cat2.png-style)
 */
import {
  clearPortraitCache,
  completePortraitJob,
  failPortraitJob,
  ingestPortraitFile,
  listPortraitJobs,
} from "../lib/portrait-queue.ts"

const [, , cmd = "list", arg, ...rest] = process.argv

if (cmd === "list") {
  const jobs = listPortraitJobs()
  if (!jobs.length) {
    console.log("No portrait jobs.")
    process.exit(0)
  }
  for (const job of jobs) {
    console.log(`${job.status.padEnd(8)} ${job.fingerprint}  ${job.characterName}`)
  }
} else if (cmd === "complete") {
  if (!arg) {
    console.error("usage: portrait-queue complete <fingerprint>")
    process.exit(1)
  }
  const job = completePortraitJob(arg)
  console.log(`ready  ${job.fingerprint}`)
} else if (cmd === "ingest") {
  const fingerprint = rest[0]
  if (!arg || !fingerprint) {
    console.error("usage: portrait-queue ingest <png> <fingerprint>")
    process.exit(1)
  }
  const result = ingestPortraitFile(arg, fingerprint)
  console.log(`ready  ${result.fingerprint}`)
  console.log(`       ${result.url}`)
} else if (cmd === "fail") {
  if (!arg) {
    console.error("usage: portrait-queue fail <fingerprint> <reason>")
    process.exit(1)
  }
  const job = failPortraitJob(arg, rest.join(" ") || "failed")
  console.log(`failed  ${job.fingerprint}  ${job.error}`)
} else if (cmd === "clear") {
  const includeStubs = arg === "--stubs" || rest.includes("--stubs")
  const result = clearPortraitCache({ includeStubs })
  console.log(
    `cleared ${result.removedFiles.length} portrait file(s); queue DB reset`
  )
  for (const name of result.removedFiles) {
    console.log(`  - ${name}`)
  }
  if (!includeStubs) {
    console.log("(other PNGs like cat2.png kept; pass --stubs to remove)")
  }
} else {
  console.error("usage: portrait-queue [list|complete|ingest|fail|clear]")
  process.exit(1)
}
