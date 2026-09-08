/**
 * In-game GM chat commands (channel `@…` gmands).
 * Levels are stock `GM_CMD_LVL_*` from constants.xml.
 * Usage/descriptions mirror ChatManager::GMCommand_Help.
 */

export type GmCommand = {
  /** Primary command name without leading @ */
  name: string
  aliases?: readonly string[]
  usage: string
  description: string
  /** Minimum UserLevel (stock threshold) */
  level: number
  category: string
}

export const GM_COMMANDS: readonly GmCommand[] = [
  {
    name: "version",
    usage: "@version",
    description: "Prints version information for the running server.",
    level: 0,
    category: "Any account",
  },
  {
    name: "license",
    usage: "@license",
    description: "Prints license information for the running server.",
    level: 0,
    category: "Any account",
  },
  {
    name: "help",
    usage: "@help [GMAND]",
    description:
      "Lists GM commands supported by the server, or prints the description of the named command.",
    level: 1,
    category: "Basic GM",
  },
  {
    name: "homepoint",
    usage: "@homepoint",
    description: "Sets your current position as your homepoint.",
    level: 1,
    category: "Basic GM",
  },
  {
    name: "lnc",
    usage: "@lnc VALUE",
    description:
      "Sets the player's LNC to VALUE. VALUE should be in the range [-10000, 10000].",
    level: 1,
    category: "Basic GM",
  },
  {
    name: "map",
    usage: "@map ID",
    description: "Adds a map for the player with the given ID.",
    level: 1,
    category: "Basic GM",
  },
  {
    name: "online",
    usage: "@online [NAME]",
    description:
      "Print how many players are online, or check if the character with a specific NAME is online.",
    level: 1,
    category: "Basic GM",
  },
  {
    name: "support",
    usage: "@support VALUE",
    description:
      "Show or hide the player character's support display state based on VALUE 1 (on) or 0 (off).",
    level: 1,
    category: "Basic GM",
  },
  {
    name: "announce",
    usage: "@announce COLOR MESSAGE...",
    description: "Announce a ticker MESSAGE with the specified COLOR.",
    level: 100,
    category: "Announcements",
  },
  {
    name: "tickermessage",
    usage: "@tickermessage MESSAGE...",
    description: "Sends the ticker message MESSAGE to all players.",
    level: 100,
    category: "Announcements",
  },
  {
    name: "title",
    usage: "@title ID",
    description: "Grants the player a new character title by ID.",
    level: 100,
    category: "Announcements",
  },
  {
    name: "zone",
    usage: "@zone ID",
    description: "Moves the player to the zone specified by ID.",
    level: 200,
    category: "Zone / QA",
  },
  {
    name: "pos",
    usage: "@pos [SPOTID|X Y]",
    description:
      "Prints the X, Y position of the player, or moves the player to the given SPOTID or X, Y position.",
    level: 200,
    category: "Zone / QA",
  },
  {
    name: "instance",
    usage: "@instance ID [VARIANTID]",
    description:
      "Creates a dungeon instance for the specified instance ID and optional variant ID. IDs must exist in the XML data.",
    level: 200,
    category: "Zone / QA",
  },
  {
    name: "dungeon-qa",
    aliases: ["dungeonqa", "dqa"],
    usage: "@dungeon-qa [list|N]",
    description:
      "Payout QA helper: enter instance N from config/dungeon_qa.tsv at the boss floor, reset payout dedup flag, enable invuln, and start the boss event.",
    level: 200,
    category: "Zone / QA",
  },
  {
    name: "invuln",
    aliases: ["god"],
    usage: "@invuln [0|1]",
    description:
      "Toggle server-side invulnerability for this session. Ignores HP damage for character and summoned demon. Optional 0/1 forces off/on; omit to toggle.",
    level: 200,
    category: "Zone / QA",
  },
  {
    name: "quest",
    usage: "@quest ID PHASE",
    description:
      "Sets the phase of the quest given by ID. Phase −1 is complete; −2 is a reset.",
    level: 200,
    category: "Zone / QA",
  },
  {
    name: "speed",
    usage: "@speed MULTIPLIER [DEMON]",
    description:
      "Multiplies the speed of the player by MULTIPLIER, or the demon if DEMON is set to 'demon'.",
    level: 200,
    category: "Zone / QA",
  },
  {
    name: "valuable",
    usage: "@valuable ID [REMOVE]",
    description:
      "Grants the player the valuable with the given ID. If REMOVE is set to 'remove', the valuable is removed.",
    level: 200,
    category: "Zone / QA",
  },
  {
    name: "item",
    usage: "@item ID|NAME [QTY]",
    description:
      "Adds the item given by ID or NAME in the specified quantity to the player's inventory. NAME may be 'macca' or 'mag'.",
    level: 250,
    category: "Items & progression",
  },
  {
    name: "va",
    usage: "@va [SLOT ITEMTYPE|-1 | clear]",
    description:
      "Set live EquippedVA and notify the client (same packets as the VA UI). No args dumps current slots. SLOT 0–26 (weapon is 24). ITEMTYPE −1 or 'clear' removes. Example: @va 3 23602, @va 24 2004.",
    level: 250,
    category: "Items & progression",
  },
  {
    name: "copygear",
    usage: "@copygear NAME",
    description:
      "Copy NAME's real EquippedItems (by Type) onto your mannequin. Skips COMP. Generates studio copies and equips them. Use for characters with no VA. Gender mismatch is refused.",
    level: 250,
    category: "Items & progression",
  },
  {
    name: "copylook",
    usage: "@copylook NAME",
    description:
      "Copy NAME's skin/hair/face/eyes/colors, EquippedVA, and active title onto your mannequin. Gender is not copied; mismatch is refused. Online source uses channel RAM, else world SQLite. If NAME has no VA, also runs @copygear. Does not copy partner demon.",
    level: 250,
    category: "Items & progression",
  },
  {
    name: "dummyweapon",
    aliases: ["dummywep"],
    usage: "@dummyweapon",
    description:
      "Equip a cheap dummy in weapon slot 13 matching EquippedVA slot 24's ItemData subCategory (tonfa/machete/pistol/…). If the dummy is missing, overwrites the first unequipped inventory slot so a full bag still works.",
    level: 250,
    category: "Items & progression",
  },
  {
    name: "reloadchar",
    usage: "@reloadchar",
    description:
      "Re-show this character in the zone (PACKET_SHOW_ENTITY) and resend OTHER_CHARACTER_DATA to nearby players. Does not send the login PACKET_CHARACTER_DATA blob (that would despawn you).",
    level: 250,
    category: "Items & progression",
  },
  {
    name: "contract",
    usage: "@contract ID|NAME",
    description: "Adds the demon given by its ID or NAME to your COMP.",
    level: 250,
    category: "Items & progression",
  },
  {
    name: "xp",
    usage: "@xp PTS [DEMON]",
    description:
      "Grants the player PTS XP, or the demon if DEMON is set to 'demon'.",
    level: 250,
    category: "Items & progression",
  },
  {
    name: "levelup",
    usage: "@levelup LEVEL [DEMON]",
    description:
      "Levels up the player to LEVEL, or the player's current partner if DEMON is set to 'demon'.",
    level: 250,
    category: "Items & progression",
  },
  {
    name: "skill",
    usage: "@skill ID DEMON",
    description:
      "Grants the skill with the specified ID to the player, or the player's partner if DEMON is set to 'demon'.",
    level: 250,
    category: "Items & progression",
  },
  {
    name: "skillpoint",
    usage: "@skillpoint PTS",
    description:
      "Adds the specified number of skill points PTS to available skill points for allocation.",
    level: 250,
    category: "Items & progression",
  },
  {
    name: "sp",
    usage: "@sp PTS",
    description: "Updates the player's partner to have PTS SP.",
    level: 250,
    category: "Items & progression",
  },
  {
    name: "effect",
    usage: "@effect ID [+/-]STACK [DEMON]",
    description:
      "Add or set the stack count for status effect ID on the player, or on the demon if DEMON is set to 'demon'.",
    level: 250,
    category: "Items & progression",
  },
  {
    name: "tokusei",
    usage: "@tokusei CLEAR|ID [STACK] [DEMON]",
    description:
      "Adds STACK of a tokusei given by ID to the player or the player's demon if DEMON is 'demon'. STACK is required unless CLEAR is 'clear'. DEMON may not be specified with CLEAR.",
    level: 250,
    category: "Items & progression",
  },
  {
    name: "expertise",
    usage: "@expertise ID RANK",
    description: "Sets the expertise by ID to a specified RANK.",
    level: 250,
    category: "Items & progression",
  },
  {
    name: "expertisemax",
    usage: "@expertisemax STACKS",
    description:
      "Adds STACKS × 1000 points to the expertise cap. Maximum expertise cap is 154,000.",
    level: 250,
    category: "Items & progression",
  },
  {
    name: "familiarity",
    usage: "@familiarity VALUE",
    description:
      "Updates the current partner's familiarity to VALUE in the range [0–10000].",
    level: 250,
    category: "Items & progression",
  },
  {
    name: "reunion",
    usage: "@reunion TYPE [RANK]",
    description:
      "Perform reunion on your currently summoned demon, setting the normal TYPE [1–12] and RANK, or an explicit growth TYPE by ID if no RANK is specified.",
    level: 250,
    category: "Items & progression",
  },
  {
    name: "fgauge",
    usage: "@fgauge VALUE",
    description:
      "Updates the current character's fusion gauge to VALUE in the range of [0–10000] times the number of fusion gauge stocks available.",
    level: 250,
    category: "Items & progression",
  },
  {
    name: "dxp",
    usage: "@dxp RACEID POINTS",
    description: "Gain digitalize XP for the specified demon race ID.",
    level: 250,
    category: "Items & progression",
  },
  {
    name: "bp",
    usage: "@bp POINTS",
    description:
      "Set the current character's Battle Point current amount and total accumulated points.",
    level: 250,
    category: "Items & progression",
  },
  {
    name: "bethel",
    usage: "@bethel INDEX AMOUNT",
    description:
      "Set the current character's bethel AMOUNT for INDEX (0–4).",
    level: 250,
    category: "Items & progression",
  },
  {
    name: "coin",
    usage: "@coin AMOUNT",
    description: "Set the current character's casino coin AMOUNT.",
    level: 250,
    category: "Items & progression",
  },
  {
    name: "cowrie",
    usage: "@cowrie AMOUNT",
    description: "Set the current character's cowrie AMOUNT.",
    level: 250,
    category: "Items & progression",
  },
  {
    name: "ziotite",
    usage: "@ziotite SMALL LARGE",
    description: "Add to the current team's SMALL and LARGE ziotite.",
    level: 250,
    category: "Items & progression",
  },
  {
    name: "plugin",
    usage: "@plugin ID",
    description: "Adds a plugin for the player with the given ID.",
    level: 250,
    category: "Items & progression",
  },
  {
    name: "ban",
    usage: "@ban NAME [1/2/3] [REASON...]",
    description:
      "Bans the account which owns the character NAME. If the account is not on the channel, remove with options 1 (current channel, default), 2 (any channel), or 3 (world/lobby — use at own risk). On success, open postings for that account on this channel are closed. Can be repeated for multi-channel setups.",
    level: 400,
    category: "Moderation",
  },
  {
    name: "kick",
    usage: "@kick NAME [1/2/3]",
    description:
      "Kicks the character with the given NAME. If their account is not on the channel, remove with options 1 (current channel, default), 2 (any channel), or 3 (world/lobby — use at own risk).",
    level: 400,
    category: "Moderation",
  },
  {
    name: "goto",
    usage: "@goto [SELF] NAME",
    description:
      "If SELF is 'self', move the player to the named character. Otherwise move that character to the player.",
    level: 400,
    category: "Moderation",
  },
  {
    name: "enemy",
    usage: "@enemy ID|NAME [AI [X Y [ROT]]]",
    description:
      "Spawns the enemy with the given ID or NAME at the character's position, or at X, Y with rotation ROT. Optional AI overrides the default AI type.",
    level: 400,
    category: "Moderation",
  },
  {
    name: "penalty",
    usage: "@penalty [NAME]",
    description:
      "Remove all PvP penalties on character NAME, or on yourself if no NAME is specified.",
    level: 400,
    category: "Moderation",
  },
  {
    name: "reported",
    usage: "@reported [COUNT|PLAYERNAME]",
    description:
      "Get unresolved reported-player records of a specified COUNT or targeted at PLAYERNAME. Full chat evidence is on the Admin → Reports page.",
    level: 400,
    category: "Moderation",
  },
  {
    name: "resolve",
    usage: "@resolve ENTRYUID",
    description:
      "Resolve a reported player record by UID. Records can be retrieved via @reported.",
    level: 400,
    category: "Moderation",
  },
  {
    name: "enchant",
    usage: "@enchant EQUIP TAROT SOUL",
    description:
      "Set enchantment TAROT and SOUL effects for EQUIP type. Use 0 to remove. EQUIP types: HEAD (0), FACE (1), NECK (2), TOP (3), ARMS (4), BOTTOM (5), FEET (6), COMP (7), RING (8), EARRING (9), EXTRA (10), BACK (11), TALISMAN (12), WEAPON (13).",
    level: 650,
    category: "Gear crafting",
  },
  {
    name: "spirit",
    usage: "@spirit EQUIP BASIC SPECIAL [B1 B2 B3]",
    description:
      "Set spirit fusion BASIC and SPECIAL effects for EQUIP type. Effect values equal the item ID they are gained from. Optional B1–B3 fusion bonuses (0–50). Same EQUIP type numbers as @enchant.",
    level: 650,
    category: "Gear crafting",
  },
  {
    name: "slotadd",
    usage: "@slotadd EQUIP",
    description:
      "Adds a slot to the specified EQUIP type. EQUIP types: TOP (3), BOTTOM (5), or WEAPON (13).",
    level: 650,
    category: "Gear crafting",
  },
  {
    name: "scrap",
    usage: "@scrap SLOT [NAME]",
    description:
      "Removes the item in inventory SLOT [1–50] from character NAME's inventory, or the player's if NAME is omitted.",
    level: 700,
    category: "Inventory wipe",
  },
  {
    name: "clearinventory",
    aliases: ["clearinv"],
    usage: "@clearinventory",
    description:
      "Wipe inventory for studio use: unequip all gear except COMP, then scrap everything else. COMP is kept. Does not clear EquippedVA — use @va clear for that.",
    level: 700,
    category: "Inventory wipe",
  },
  {
    name: "post",
    usage: "@post ID [NAME]",
    description:
      "Adds the post item given by ID to character NAME's post, or the player's post if NAME is omitted.",
    level: 750,
    category: "Post",
  },
  {
    name: "addcp",
    usage: "@addcp AMOUNT [NAME]",
    description:
      "Gives AMOUNT of CP to character NAME, or to yourself if no NAME is specified.",
    level: 950,
    category: "Server control",
  },
  {
    name: "counter",
    usage: "@counter ID [NAME] [VALUE]",
    description:
      "View a world counter with a specific ID, or view/add to the VALUE of the counter from character NAME.",
    level: 950,
    category: "Server control",
  },
  {
    name: "crash",
    usage: "@crash",
    description: "Causes the server to crash for testing the database.",
    level: 950,
    category: "Server control",
  },
  {
    name: "event",
    usage: "@event [ID [PARAMS]]",
    description:
      "Starts an event specified by ID, or returns the current event if not specified. Extra PARAMS can override transform-script params when applicable.",
    level: 950,
    category: "Server control",
  },
  {
    name: "flag",
    usage: "@flag TYPE [CID KEY [VALUE]]",
    description:
      "List, get, or set zone flags. TYPE must be 'zone' or 'inst'. CID may be 0 for no specific character. If VALUE is omitted, the key is printed instead of set.",
    level: 950,
    category: "Server control",
  },
  {
    name: "gp",
    usage: "@gp VALUE [NAME]",
    description:
      "Set Grade Points on character NAME, or yourself if omitted. Ranked grades are 1000 points higher than the displayed value (e.g. 1000 for ranked base).",
    level: 950,
    category: "Server control",
  },
  {
    name: "spawn",
    usage: "@spawn",
    description:
      "Spawn the max number of enemies in each spawn group in the current zone.",
    level: 950,
    category: "Server control",
  },
  {
    name: "worldtime",
    usage: "@worldtime OFFSET",
    description:
      "Adjusts the current channel's world clock by OFFSET seconds (2 ≈ 1 minute, 120 ≈ 1 hour, 1440 ≈ 1 phase).",
    level: 950,
    category: "Server control",
  },
] as const

export type GmCommandTier = {
  level: number
  label: string
  commands: string[]
}

/** Grouped thresholds for compact UI (e.g. RegistrationUserLevel help). */
export function getGmCommandTiers(): GmCommandTier[] {
  const byLevel = new Map<number, GmCommandTier>()
  for (const cmd of GM_COMMANDS) {
    let tier = byLevel.get(cmd.level)
    if (!tier) {
      tier = { level: cmd.level, label: cmd.category, commands: [] }
      byLevel.set(cmd.level, tier)
    }
    const label = `@${cmd.name}${cmd.aliases?.length ? ` / @${cmd.aliases.join(" / @")}` : ""}`
    tier.commands.push(label)
  }
  return [...byLevel.values()].sort((a, b) => a.level - b.level)
}

/** @deprecated Prefer getGmCommandTiers() — kept for existing imports. */
export const GM_COMMAND_TIERS: readonly GmCommandTier[] = [
  ...getGmCommandTiers(),
  {
    level: 1000,
    label: "Website admin",
    commands: [
      "Lobby HTTP admin API / this Admin site (not an in-game @ command)",
    ],
  },
]
