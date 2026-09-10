import { fetcher } from "@/lib/fetcher"
import { api } from "@/lib/kyClient"
import type {
  WebGameFilePayload,
  WebGameId,
  WebGameSettingsMap,
} from "@/lib/webgames-types"

export type CasinoListResponse = {
  restartPending: boolean
  games: WebGameFilePayload[]
}

export type CasinoFlashAsset = {
  game: WebGameId
  label: string
  fileName: string
  present: boolean
  sizeBytes: number | null
  path: string
}

export type CasinoFlashAssetsResponse = {
  webRoot: string
  ready: boolean
  assets: CasinoFlashAsset[]
}

export const fetchAdminCasino = () =>
  fetcher<CasinoListResponse>("admin/casino")

export const fetchAdminCasinoAssets = () =>
  fetcher<CasinoFlashAssetsResponse>("admin/casino/assets")

export const fetchAdminCasinoGame = <T extends WebGameId>(game: T) =>
  fetcher<WebGameFilePayload<T>>(`admin/casino/${game}`)

export async function saveAdminCasinoGame<T extends WebGameId>(
  game: T,
  settings: WebGameSettingsMap[T]
): Promise<WebGameFilePayload<T>> {
  return fetcher<WebGameFilePayload<T>>(`admin/casino/${game}`, {
    method: "PUT",
    json: { game, settings },
  })
}

export async function uploadAdminCasinoSwf(
  game: WebGameId,
  file: File
): Promise<CasinoFlashAssetsResponse> {
  const form = new FormData()
  form.set("game", game)
  form.set("file", file)
  return fetcher<CasinoFlashAssetsResponse>("admin/casino/assets", {
    method: "POST",
    body: form,
  })
}

export async function restartLobbyForCasino(): Promise<string> {
  const response = await api.post("admin/ops/restart/lobby", {
    timeout: 180_000,
  })
  const json = (await response.json()) as {
    success?: boolean
    message?: string
  }
  if (!response.ok || !json.success) {
    throw new Error(json.message || `HTTP ${response.status}`)
  }
  return json.message || "Lobby restarted"
}
