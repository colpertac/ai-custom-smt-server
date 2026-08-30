import { fetcher } from "@/lib/fetcher"
import { api } from "@/lib/kyClient"
import type { ConfigFileStatus } from "@/lib/server-config/types"
import type { ConfigDocument, FieldDef } from "@/lib/server-config/types"
import type { ValidationIssue } from "@/lib/server-config/validate"
import type { OpsLaneAConfigPublishResult } from "@/lib/ops-sidecar"

export type ConfigListResponse = { files: ConfigFileStatus[] }

export type ConfigDetailResponse = {
  id: string
  document: ConfigDocument
  fields: FieldDef[] | null
}

export type ConfigSaveResult = {
  id: string
  warnings: ValidationIssue[]
}

export class ConfigSaveError extends Error {
  issues: ValidationIssue[]
  constructor(message: string, issues: ValidationIssue[]) {
    super(message)
    this.name = "ConfigSaveError"
    this.issues = issues
  }
}

export const fetchAdminConfigList = () =>
  fetcher<ConfigListResponse>("admin/config")

export const fetchAdminConfig = (id: string) =>
  fetcher<ConfigDetailResponse>(`admin/config/${id}`)

export async function saveAdminConfig(
  id: string,
  document: ConfigDocument
): Promise<ConfigSaveResult> {
  const response = await api(`admin/config/${id}`, {
    method: "PUT",
    json: document,
  })
  const json = (await response.json()) as {
    success?: boolean
    message?: string
    data?: { id?: string; warnings?: ValidationIssue[]; issues?: ValidationIssue[] }
  }
  if (!response.ok || !json.success) {
    const issues = json.data?.issues ?? []
    throw new ConfigSaveError(
      json.message || `HTTP ${response.status}`,
      Array.isArray(issues) ? issues : []
    )
  }
  return {
    id: json.data?.id ?? id,
    warnings: Array.isArray(json.data?.warnings) ? json.data.warnings : [],
  }
}

export const validateAdminConfigPublish = (only?: string[]) =>
  fetcher<OpsLaneAConfigPublishResult>(
    "admin/ops/publish/lane-a-config/validate",
    {
      method: "POST",
      json: { only },
    }
  )

export const applyAdminConfigPublish = (
  releaseId: string,
  restart = true
) =>
  fetcher<OpsLaneAConfigPublishResult>(
    "admin/ops/publish/lane-a-config/apply",
    {
      method: "POST",
      json: { releaseId, restart },
    }
  )

export const rollbackAdminConfigPublish = (releaseId?: string) =>
  fetcher<OpsLaneAConfigPublishResult>(
    "admin/ops/publish/lane-a-config/rollback",
    {
      method: "POST",
      json: { releaseId, restart: true },
    }
  )
