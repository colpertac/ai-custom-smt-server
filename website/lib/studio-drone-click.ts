/**
 * Map a click on an object-contain image to window fractions (0–1).
 * Letterboxing around the photo must not count as the game window.
 */

export type ImageBox = {
  naturalWidth: number
  naturalHeight: number
  clientWidth: number
  clientHeight: number
}

export type ClickFrac = { xFrac: number; yFrac: number }

function displayedContainBox(img: ImageBox): {
  left: number
  top: number
  width: number
  height: number
} | null {
  const nw = img.naturalWidth
  const nh = img.naturalHeight
  const cw = img.clientWidth
  const ch = img.clientHeight
  if (nw <= 0 || nh <= 0 || cw <= 0 || ch <= 0) return null
  const scale = Math.min(cw / nw, ch / nh)
  const width = nw * scale
  const height = nh * scale
  return {
    left: (cw - width) / 2,
    top: (ch - height) / 2,
    width,
    height,
  }
}

export function containClickToFrac(
  offsetX: number,
  offsetY: number,
  img: ImageBox
): ClickFrac | null {
  const box = displayedContainBox(img)
  if (!box) return null
  const x = offsetX - box.left
  const y = offsetY - box.top
  if (x < 0 || y < 0 || x > box.width || y > box.height) return null
  return {
    xFrac: Math.min(1, Math.max(0, x / box.width)),
    yFrac: Math.min(1, Math.max(0, y / box.height)),
  }
}

/** CSS % of the img element for a crosshair (accounts for letterbox). */
export function fracToContainPercent(
  frac: ClickFrac,
  img: ImageBox
): { leftPct: number; topPct: number } | null {
  const box = displayedContainBox(img)
  if (!box) return null
  const x = box.left + frac.xFrac * box.width
  const y = box.top + frac.yFrac * box.height
  return {
    leftPct: (x / img.clientWidth) * 100,
    topPct: (y / img.clientHeight) * 100,
  }
}

export function formatClickFrac(frac: ClickFrac): string {
  return `${frac.xFrac.toFixed(3)}, ${frac.yFrac.toFixed(3)}`
}
