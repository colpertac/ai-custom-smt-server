/**
 * Standalone entry: raise Node HTTP timeouts before loading Next's server.js.
 * Default requestTimeout is 300s — multi‑GB admin zip uploads need longer.
 * Use .cjs because standalone package.json has "type": "module".
 */
const http = require("http")
const https = require("https")

const TWO_HOURS_MS = 2 * 60 * 60 * 1000

function patchServer(server) {
  if (!server || typeof server !== "object") return server
  server.requestTimeout = TWO_HOURS_MS
  // headersTimeout must stay >= requestTimeout (Node warning otherwise).
  server.headersTimeout = TWO_HOURS_MS + 10_000
  server.keepAliveTimeout = Math.max(server.keepAliveTimeout || 0, 120_000)
  return server
}

function wrapCreateServer(mod) {
  const original = mod.createServer
  mod.createServer = function patchedCreateServer(...args) {
    return patchServer(original.apply(this, args))
  }
}

wrapCreateServer(http)
wrapCreateServer(https)

require("./server.js")
