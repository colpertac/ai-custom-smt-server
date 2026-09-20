import path from "node:path"
import { fileURLToPath } from "node:url"

import { getRuntimeDir } from "@/lib/server-config/fs"

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(LIB_DIR, "../../..")

export const RECOVERY_SNAPSHOTS_KEEP = 10

export const ADMIN_PAYOUTS_ZIP = "zzz_ai_custom_payouts_admin.zip"
export const ADMIN_REPORT_REWARDS_ZIP = "zzz_ai_custom_report_rewards_admin.zip"

export function getRecoveryReleasesDir(): string {
  if (process.env.OPS_RECOVERY_RELEASES_DIR?.trim()) {
    return path.resolve(process.env.OPS_RECOVERY_RELEASES_DIR.trim())
  }
  return path.join(getRuntimeDir(), "releases", "recovery")
}

/** Same templates install.sh copies into data/config when missing. */
export function getStockConfigDir(): string {
  if (process.env.COMP_STOCK_CONFIG_DIR?.trim()) {
    return path.resolve(process.env.COMP_STOCK_CONFIG_DIR.trim())
  }
  return path.join(REPO_ROOT, "deploy", "seed", "config")
}

export function getDatastoreShopsDir(): string {
  return path.join(getRuntimeDir(), "datastore", "shops")
}

export function getDatastorePackagesDir(): string {
  return path.join(getRuntimeDir(), "datastore", "packages")
}

export function newRecoveryId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-")
}
