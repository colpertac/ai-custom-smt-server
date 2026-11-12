/**
 * Which pipeline renders armory portraits (avatar/docs/WORKER.md).
 *
 * - `wine` (default): Wine mannequin studio, v2 fingerprints, studio probes.
 * - `three`: three.js render worker (avatar/worker), v3 recipe fingerprints, heartbeats.
 *
 * No imports: scripts load this through `node --experimental-strip-types`.
 */

export type PortraitRendererMode = "wine" | "three"

/**
 * Bump whenever the render worker's output for the same recipe changes. Part of the v3
 * fingerprint, so a bump re-renders every portrait; workers on another version may not claim.
 */
export const RENDERER_VERSION = 1

export const THREE_PORTRAIT_PRESET = "front"
export const THREE_PORTRAIT_WIDTH = 768
export const THREE_PORTRAIT_HEIGHT = 925

/** A render worker counts as online when its last heartbeat is newer than this. */
export const RENDER_WORKER_FRESH_MS = 60_000

/** `PORTRAIT_RENDERER` env, read per call so a restart (or a test) can switch it. */
export function getPortraitRendererMode(): PortraitRendererMode {
  return process.env.PORTRAIT_RENDERER?.trim().toLowerCase() === "three"
    ? "three"
    : "wine"
}
