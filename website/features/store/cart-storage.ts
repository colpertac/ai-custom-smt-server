export type CartLine = {
  itemId: number
  name: string
  qty: number
}

const STORAGE_KEY = "smt_wiki_cart_v1"
export const CART_CHANGED_EVENT = "smt-wiki-cart-changed"

function emitCartChanged(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(CART_CHANGED_EVENT))
}

export function readCart(): CartLine[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((row) => {
        const itemId = Math.floor(Number((row as CartLine).itemId))
        const qty = Math.floor(Number((row as CartLine).qty))
        const name = String((row as CartLine).name ?? "")
        if (!Number.isInteger(itemId) || itemId <= 0) return null
        if (!Number.isInteger(qty) || qty < 1) return null
        return { itemId, name: name || `Item #${itemId}`, qty: Math.min(qty, 10) }
      })
      .filter((row): row is CartLine => row != null)
  } catch {
    return []
  }
}

function writeCart(lines: CartLine[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
  emitCartChanged()
}

export function cartItemCount(lines = readCart()): number {
  return lines.reduce((sum, line) => sum + line.qty, 0)
}

export function addToCart(item: {
  itemId: number
  name: string
  qty?: number
}): CartLine[] {
  const qty = Math.min(10, Math.max(1, Math.floor(item.qty ?? 1)))
  const lines = readCart()
  const existing = lines.find((l) => l.itemId === item.itemId)
  if (existing) {
    existing.qty = Math.min(10, existing.qty + qty)
    existing.name = item.name || existing.name
  } else {
    lines.push({
      itemId: item.itemId,
      name: item.name,
      qty,
    })
  }
  writeCart(lines)
  return lines
}

export function setCartQty(itemId: number, qty: number): CartLine[] {
  const lines = readCart()
  const next = Math.floor(qty)
  if (next < 1) {
    return removeFromCart(itemId)
  }
  const line = lines.find((l) => l.itemId === itemId)
  if (!line) return lines
  line.qty = Math.min(10, next)
  writeCart(lines)
  return lines
}

export function removeFromCart(itemId: number): CartLine[] {
  const lines = readCart().filter((l) => l.itemId !== itemId)
  writeCart(lines)
  return lines
}

export function clearCart(): void {
  writeCart([])
}

export function clearCartItems(itemIds: number[]): void {
  const remove = new Set(itemIds)
  writeCart(readCart().filter((l) => !remove.has(l.itemId)))
}
