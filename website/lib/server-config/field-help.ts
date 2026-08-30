/**
 * Human-readable help for COMP objgen config members.
 * Keys are member names (shared across lobby/world/channel where identical).
 */
export const CONFIG_FIELD_HELP: Record<string, string> = {
  // ServerConfig (shared)
  DiffieHellmanKeyPair:
    "512-hex-char DH keypair used for client login crypto. Must match across lobby/world/channel.",
  Port: "TCP listen port for this process.",
  DatabaseType: "Which database backend this process uses (SQLite3 or MariaDB).",
  MultithreadMode: "Run packet/worker processing on multiple threads when true.",
  DataStore:
    "Relative paths (from process cwd) that hold server content packages and BinaryData.",
  DataStoreSync:
    "When true, reload/sync datastore packages more aggressively; false is typical for local native runs.",
  LogFile: "Path for this process’s log file (relative to runtime cwd).",
  LogFileTimestamp: "Prefix each log line with a timestamp.",
  LogFileAppend: "Append to the log file instead of truncating on start.",
  LogRotation: "Enable automatic log file rotation.",
  LogCompression: "Compress rotated log archives.",
  LogRotationCount: "How many rotated log files to keep.",
  LogRotationDays: "Rotate logs after this many days.",
  LogLevels: "Per-category log verbosity (key=category, value=LEVEL_*).",
  CapturePath: "Optional directory for packet/network capture dumps.",
  ServerConstantsPath:
    "Override path to constants.xml; empty uses the default next to this config.",
  MemoryDiagnostic: "Extra memory diagnostics in logs (noisy; leave off unless debugging).",

  // Database
  MariaDBConfig: "MariaDB connection settings (used when DatabaseType is MARIADB).",
  SQLite3Config: "SQLite3 settings (used when DatabaseType is SQLITE3).",
  DatabaseName: "Logical database / schema name.",
  FileDirectory: "Directory for SQLite database files (relative to runtime cwd).",
  MaxRetryCount: "How many times to retry a failed DB operation.",
  RetryDelay: "Milliseconds to wait between DB retries.",
  IP: "MariaDB host address.",
  Username: "MariaDB username.",
  Password: "MariaDB password.",
  MockData: "Use mock/in-memory data instead of a real DB (dev only).",
  MockDataFilename: "File used when MockData is enabled.",
  AutoSchemaUpdate: "Apply schema migrations automatically on startup.",
  DefaultDatabaseType: "Fallback database type label for shared DB helpers.",

  // Lobby
  WebListeningPort: "HTTP port for lobby web/API (account tools, import, admin HTTP).",
  WebCertificate: "TLS certificate path for the lobby web listener (empty = plain HTTP).",
  WebRoot: "Directory served / used by lobby web endpoints.",
  ClientVersion: "Client version string the lobby accepts (e.g. 1.666).",
  WebAuthTimeOut: "Seconds before a web/auth session times out.",
  CharacterDeletionDelay:
    "Minutes a deleted character stays recoverable before permanent wipe (0 = immediate).",
  CharacterTicketCost: "CP cost to buy an extra character ticket (0 = free / unset).",
  StartupCharacterDelete:
    "Process pending character deletions when the lobby starts.",
  RegistrationCP: "Starting CP granted to newly registered accounts.",
  RegistrationTicketCount:
    "Character creation tickets given to a brand-new registered account.",
  RegistrationUserLevel:
    "UserLevel assigned on registration (0 = normal player; high values are GM-like).",
  RegistrationAccountEnabled:
    "Whether newly registered accounts are enabled immediately.",
  CharacterNameRegex:
    "Optional regex that new character names must match; empty = default rules.",
  PlayOpeningMovie: "Play the opening movie for new / returning clients when true.",
  AllowImport: "Allow account import via the lobby import API.",
  ImportStripUserLevel: "Strip elevated UserLevel from imported accounts.",
  ImportStripCP: "Strip CP from imported accounts.",
  ImportMaxPayload: "Max import XML payload size in kilobytes.",
  ImportWorld: "World ID stamped onto imported characters.",
  MaxClients: "Max concurrent lobby clients (0 = unlimited).",

  // World
  ID: "World ID presented to the lobby/clients.",
  Name: "Display name for this world or channel.",
  LobbyIP: "Address the world uses to reach the lobby.",
  LobbyPort: "Lobby TCP port the world connects to.",
  ChannelConnectionTimeOut:
    "Seconds before a channel connection attempt to the world times out.",
  WorldSharedConfig:
    "Gameplay knobs shared with channels (XP, loot timers, AI, anti-spam, etc.).",

  // Channel
  ReservedID: "Force a specific channel ID (−1 = auto-assign from world).",
  ExternalIP: "Public IP/hostname clients use to connect to this channel.",
  WorldIP: "Address this channel uses to reach the world process.",
  WorldPort: "World TCP port this channel connects to.",
  Timeout: "Client idle/timeout seconds for channel connections.",
  SystemMessage: "Banner/system message shown to players on this channel.",
  SystemMessageColor: "Color of the system message banner.",
  PerfMonitorEnabled: "Enable channel performance monitoring counters.",
  VerifyServerData: "Validate server data packages more strictly on load.",
  StudioHttpPort:
    "HTTP port for the portrait studio API (0 = disabled). Binds all interfaces — protect with StudioToken.",
  StudioToken: "Shared secret required by studio HTTP requests.",

  // WorldSharedConfig
  TimeOffset: "Server time offset in minutes from UTC (stock JP offset is 540).",
  GreetMessage: "Message shown when a player enters the world/channel.",
  COMPShopMessage: "Welcome text shown in the COMP shop UI.",
  MoveCorrection: "Correct client movement / rubber-banding server-side.",
  AutoCompressCurrency: "Automatically compress Macca into notes when inventory fills.",
  NRAStatusNull: "Null NRA (new-record-attempt) status handling quirk; leave default unless you know you need it.",
  DeathPenaltyDisabled: "Disable death penalties (XP/item loss rules that stock applies).",
  DeadTokuseiDisabled: "Disable tokusei effects that only apply while dead.",
  DropLuckScalingCap:
    "Cap on luck-scaled drop rate bonus (−1 = no cap).",
  XPBonus: "Extra XP multiplier/bonus applied on top of stock rates.",
  ExpertiseBonus: "Bonus to expertise gains.",
  DropRateBonus: "Global drop-rate bonus multiplier.",
  LoginPointBonus: "Bonus to login points awarded.",
  FusionGaugeBonus: "Bonus to fusion gauge gain (default 3.0 in stock schema).",
  BethelBonus: "Bonus to Bethel gains.",
  DigitalizePointBonus: "Bonus to digitalize points.",
  LevelUpBonusChance: "Percent chance to grant a bonus on level-up.",
  LevelUpBonusMax: "Max bonus applications from LevelUpBonusChance.",
  EnabledDemonQuests: "Bitmask of enabled demon quest categories (hex OK).",
  BazaarMarketCost: "Override bazaar market listing cost (0 = stock default).",
  BazaarMarketTime: "Override bazaar listing duration (0 = stock default).",
  CritDefenseReduction:
    "How much crit defense reduces crit damage (0–1; 1.0 = full stock effect).",
  LevelCap: "Maximum character level players can reach.",
  ReunionMax: "Maximum reunion rank allowed.",
  BikeBoostHide: "Hide bike boost VFX/state from other players when true.",
  PvPQueueWait: "Seconds to wait in the PvP matchmaking queue.",
  PvPGhosts: "PvP ghost NPC IDs (two slots).",
  PentalphaPayoutAll: "Pay Pentalpha rewards to all participants when true.",
  PentalphaMinMaxPayout: "Min/max Pentalpha payout range (−1 = stock).",
  DailyGPLoss: "Guild points lost per day of inactivity / daily decay amount.",
  ChannelDistribution: "Map of channel ID → load-balancing weight.",
  AIAggroLimit: "How enemies share aggro (player-shared, independent, or none).",
  AICombatStagger: "Allow AI combat stagger behavior.",
  AIEstomaBossIgnore: "Bosses ignore Estoma when true.",
  AIEstomaChargeIgnore: "Charging enemies ignore Estoma when true.",
  AIEstomaDuration: "Estoma effect duration in seconds.",
  AILazyPathing: "Use cheaper AI pathing (better performance, less precise).",
  IFramesEnabled: "Honor invulnerability frames in combat.",
  SpawnSpamUserLevel: "UserLevel at/above which spawn-spam limits apply differently.",
  SpawnSpamUserMax: "Max spawns a single user may create before limits kick in.",
  SpawnSpamGlobalZoneMax: "Max spam spawns allowed in a normal zone globally.",
  SpawnSpamInstanceZoneMax: "Max spam spawns allowed in an instance zone.",
  AutobanSpawnSpammers: "Automatically ban accounts that trip spawn-spam limits.",
  ClockSkewThreshold: "Seconds of client clock skew before counting a strike.",
  ClockSkewCount: "Skew strikes before AutobanClockSkew may fire.",
  AutobanClockSkew: "Autoban clients that repeatedly fail clock skew checks.",
  LogoutDelay: "Seconds before a character fully logs out after requesting logout.",
  LootBodyDuration: "Seconds a loot body stays in the world.",
  LootBodyEmptyDuration: "Seconds an emptied loot body remains before despawn.",
  LootRestrictedDuration:
    "Seconds loot stays party-restricted before free-for-all.",
  LootBodyPostLootRemove: "Seconds after looting before the body is removed.",
  LootEggDuration: "Seconds a demon egg/contract stays before despawn.",
  LootEggRestrictedDuration:
    "Seconds an egg stays party-restricted before anyone can take it.",
  MaxMoveIncreaseSum:
    "Percent sum floor for MOVE1/MOVE2 move-speed caps (was constants.xml MAX_MOVE_INCREASE_SUM).",
  ChatLogRetentionDays:
    "Days to keep ChatLogEntry rows before hourly prune (0 = never prune).",
}

/** Setup.xml Account fields. */
export const SETUP_FIELD_HELP: Record<string, string> = {
  UID: "Persistent account UUID (keep stable if the account already exists in the DB).",
  Username: "Login username.",
  DisplayName: "Name shown in UIs / GM tools.",
  Email: "Account email (may be used by web tools).",
  Password: "Plain password for first-boot seed only; lobby hashes on create.",
  CP: "Starting COMP Points.",
  TicketCount: "Character creation tickets on this account.",
  UserLevel: "Privilege level (≈1000+ for admin tools on this site).",
  Enabled: "Account can log in when true.",
  IsGM: "Mark account as GM for stock GM checks.",
}

export const NEWCHAR_FIELD_HELP: Record<string, string> = {
  HomepointZone: "Zone ID where new characters spawn / set home.",
  HomepointSpotID: "Spot ID inside HomepointZone for the spawn point.",
  LearnedSkills: "Skill IDs granted to a brand-new character (one per line).",
}

export function fieldHelp(name: string): string | undefined {
  return CONFIG_FIELD_HELP[name] ?? SETUP_FIELD_HELP[name] ?? NEWCHAR_FIELD_HELP[name]
}

/** Fallback when no curated blurb exists: readable CamelCase split. */
export function fieldHelpOrFallback(name: string): string {
  const known = fieldHelp(name)
  if (known) return known
  const words = name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ")
  return `${words} (no detailed help yet — see COMP schema / server code).`
}
