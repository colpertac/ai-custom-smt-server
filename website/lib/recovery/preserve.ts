/**
 * Identity fields kept when resetting gameplay knobs to stock templates.
 * Everything else comes from deploy/seed/config.
 */
export const PRESERVE_FIELDS = {
  all: ["DiffieHellmanKeyPair"] as const,
  lobby: [
    "DiffieHellmanKeyPair",
    "DatabaseType",
    "SQLite3Config",
    "MariaDBConfig",
    "WebListeningPort",
    "ClientVersion",
    "WebRoot",
  ] as const,
  world: ["DiffieHellmanKeyPair", "LobbyIP", "Name", "DatabaseType", "SQLite3Config", "MariaDBConfig"] as const,
  // ChannelConfig has DatabaseType but no SQLite3Config/MariaDBConfig
  // (unlike lobby/world). Do not list those here — they are not schema fields.
  channel: [
    "DiffieHellmanKeyPair",
    "ExternalIP",
    "WorldIP",
    "StudioToken",
    "StudioHttpPort",
    "Name",
    "DatabaseType",
  ] as const,
} as const

export type StockKnobFileId = "lobby" | "world" | "channel" | "constants"
