/** Visual skins from /test1–/test5 — same layout, different token packs. */
export const SKINS = [
  {
    id: "stage",
    label: "Stage",
    blurb: "Gold / slate stage",
  },
  {
    id: "neworder",
    label: "NewOrder",
    blurb: "Official-era chrome",
  },
  {
    id: "forum",
    label: "Forum",
    blurb: "Denser board greens",
  },
  {
    id: "banner",
    label: "Banner",
    blurb: "Private-server polish",
  },
  {
    id: "comp",
    label: "COMP",
    blurb: "Terminal console",
  },
] as const

export type SkinId = (typeof SKINS)[number]["id"]

export const DEFAULT_SKIN: SkinId = "banner"

export const SKIN_IDS = SKINS.map((s) => s.id) as SkinId[]

export function isSkinId(value: string | undefined | null): value is SkinId {
  return SKIN_IDS.includes(value as SkinId)
}
