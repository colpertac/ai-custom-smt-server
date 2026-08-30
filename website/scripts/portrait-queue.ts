/**
 * Manual Path 1 worker helper. Does not screenshot — claims a job and
 * prints @va lines for the mannequin client.
 *
 *   npm run portrait-queue
 *   npm run portrait-queue -- claim
 *   npm run portrait-queue -- complete <fingerprint>
 *   npm run portrait-queue -- ingest <png> <fingerprint>
 *   npm run portrait-queue -- fail <fingerprint> <reason>
 */
import {
  claimPortraitJob,
  completePortraitJob,
  failPortraitJob,
  gmDressCommands,
  ingestPortraitFile,
  listPortraitJobs,
} from "../lib/portrait-queue.ts"

const [, , cmd = "list", arg, ...rest] = process.argv

function printJob(
  job: NonNullable<ReturnType<typeof claimPortraitJob>>,
  header: string
) {
  console.log(header)
  console.log(`  fingerprint  ${job.fingerprint}`)
  console.log(`  character    ${job.characterName}`)
  console.log(`  status       ${job.status}`)
  console.log(`  canonical    ${job.payload.canonical}`)
  console.log("")
  console.log(gmDressCommands(job.payload).join("\n"))
  console.log("")
  console.log(`Save the crop, then:`)
  console.log(
    `  npm run portrait-queue -- ingest /path/to/crop.png ${job.fingerprint}`
  )
}

if (cmd === "list") {
  const jobs = listPortraitJobs()
  if (!jobs.length) {
    console.log("No portrait jobs.")
    process.exit(0)
  }
  for (const job of jobs) {
    console.log(`${job.status.padEnd(8)} ${job.fingerprint}  ${job.characterName}`)
  }
} else if (cmd === "claim") {
  const job = claimPortraitJob()
  if (!job) {
    console.log("Queue empty.")
    process.exit(0)
  }
  printJob(job, "Claimed:")
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
} else {
  console.error(
    "usage: portrait-queue [list|claim|complete|ingest|fail]"
  )
  process.exit(1)
}
