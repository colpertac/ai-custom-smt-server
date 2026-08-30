import type { ConfigFileId, ConfigFileMeta } from "./types.ts"

export const CONFIG_FILES: ConfigFileMeta[] = [
  {
    id: "lobby",
    filename: "lobby.xml",
    label: "Lobby",
    description: "LobbyConfig — ports, registration, import, DH key, datastore",
    editor: "objgen",
    restart: ["lobby"],
    requiredToRun: true,
  },
  {
    id: "world",
    filename: "world.xml",
    label: "World",
    description: "WorldConfig + WorldSharedConfig gameplay knobs",
    editor: "objgen",
    restart: ["world", "channel"],
    requiredToRun: true,
  },
  {
    id: "channel",
    filename: "channel.xml",
    label: "Channel",
    description: "ChannelConfig — bind, world link, system message, studio API",
    editor: "objgen",
    restart: ["channel"],
    requiredToRun: true,
  },
  {
    id: "setup",
    filename: "setup.xml",
    label: "Setup",
    description: "First-boot seed Accounts (optional once DB has accounts)",
    editor: "setup",
    restart: ["lobby"],
    requiredToRun: false,
  },
  {
    id: "constants",
    filename: "constants.xml",
    label: "Constants",
    description: "Server constants loaded by every BaseServer",
    editor: "constants",
    restart: ["lobby", "world", "channel"],
    requiredToRun: true,
  },
  {
    id: "newcharacter",
    filename: "newcharacter.xml",
    label: "New character",
    description: "Channel starter kit (Character + items); optional",
    editor: "newcharacter",
    restart: ["channel"],
    requiredToRun: false,
  },
]

export function configMeta(id: string): ConfigFileMeta | undefined {
  return CONFIG_FILES.find((f) => f.id === id)
}

export function isConfigFileId(id: string): id is ConfigFileId {
  return CONFIG_FILES.some((f) => f.id === id)
}

/** Services to restart given the set of applied config file ids. */
export function restartServicesFor(
  ids: ConfigFileId[]
): Array<"lobby" | "world" | "channel"> {
  const set = new Set<"lobby" | "world" | "channel">()
  for (const id of ids) {
    const meta = configMeta(id)
    if (!meta) continue
    for (const s of meta.restart) set.add(s)
  }
  // Restart order: lobby → world → channel
  return (["lobby", "world", "channel"] as const).filter((s) => set.has(s))
}
