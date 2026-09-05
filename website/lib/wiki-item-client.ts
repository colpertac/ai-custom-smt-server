/** Client helper — fetch a wiki item from the live (runtime-aware) API. */
export async function fetchWikiItem(
  id: number
): Promise<import("@/content/wiki/types").WikiItem | null> {
  if (!Number.isFinite(id) || id <= 0) return null
  try {
    const res = await fetch(`/api/wiki/items/${id}`)
    if (!res.ok) return null
    const data = (await res.json()) as {
      item?: import("@/content/wiki/types").WikiItem
    }
    return data.item ?? null
  } catch {
    return null
  }
}
