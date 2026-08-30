import { fetcher } from "@/lib/fetcher"
import type { EconomyPreset, EconomyPresetInput } from "@/lib/cp-presets-store"

export type { EconomyPreset }

export const fetchAdminCpPresets = () =>
  fetcher<EconomyPreset[]>("admin/cp-presets")

export const createAdminCpPreset = (payload: EconomyPresetInput) =>
  fetcher<EconomyPreset>("admin/cp-presets", {
    method: "POST",
    json: payload,
  })

export const updateAdminCpPreset = (id: string, payload: EconomyPresetInput) =>
  fetcher<EconomyPreset>(`admin/cp-presets/${encodeURIComponent(id)}`, {
    method: "PUT",
    json: payload,
  })

export const deleteAdminCpPreset = (id: string) =>
  fetcher<{ id: string }>(`admin/cp-presets/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })

export const duplicateAdminCpPreset = (id: string, label?: string) =>
  fetcher<EconomyPreset>(
    `admin/cp-presets/${encodeURIComponent(id)}/duplicate`,
    {
      method: "POST",
      json: label ? { label } : {},
    }
  )

export const restoreDefaultAdminCpPresets = () =>
  fetcher<EconomyPreset[]>("admin/cp-presets", {
    method: "POST",
    json: { action: "restore-defaults" },
  })
