/**
 * Manual Path 1 worker helper. Does not screenshot — claims a job and
 * prints @va lines for the mannequin client.
 *
 *   npm run portrait-queue
 *   npm run portrait-queue -- claim
 *   npm run portrait-queue -- complete <fingerprint>
 *   npm run portrait-queue -- fail <fingerprint> <reason>
 */
import {
  claimPortraitJob,
  completePortraitJob,
  failPortraitJob,
  gmDressCommands,
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
  console.log(`Write public/armory/portraits/${job.fingerprint}.png then:`)
  console.log(`  npm run portrait-queue -- complete ${job.fingerprint}`)
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
} else if (cmd === "fail") {
  if (!arg) {
    console.error("usage: portrait-queue fail <fingerprint> <reason>")
    process.exit(1)
  }
  const job = failPortraitJob(arg, rest.join(" ") || "failed")
  console.log(`failed  ${job.fingerprint}  ${job.error}`)
} else {
  console.error("usage: portrait-queue [list|claim|complete|fail]")
  process.exit(1)
}
