import crypto from "node:crypto"
import fs from "node:fs"

import { DatabaseSync } from "./node-sqlite.ts"
import { getLobbyDbPath, resetLobbyDbCache, LobbyDbMissingError } from "./lobby-db"
import { getWorldDbPath, resetWorldDbCache, WorldDbMissingError } from "./world-db"
import { ADMIN_USER_LEVEL } from "./admin-level"
import type { CompAuthState } from "./comp-api"
import { adminUpdateAccount } from "./comp-api"

export type StudioMannequinRole = "vam1" | "vaf1"

export type StudioMannequinAccountStatus = {
  username: string
  exists: boolean
  userLevel: number
  isAdmin: boolean
  enabled: boolean
  characterName: string | null
  characterExists: boolean
  characterGender: number | null
  characterZone: number | null
  accountUid: string | null
  characterUid: string | null
}

export type StudioAccountsOverview = {
  vam1: StudioMannequinAccountStatus
  vaf1: StudioMannequinAccountStatus
}

export type StudioSeedOptions = {
  vamPass?: string
  vafPass?: string
  auth?: CompAuthState
}

export type StudioRoleSeedResult = {
  account: string
  accountCreated: boolean
  adminGranted: boolean
  character: string
  characterCreated: boolean
  gender: "male" | "female"
  zone: number
}

export type StudioSeedResult = {
  ok: boolean
  vam: StudioRoleSeedResult
  vaf: StudioRoleSeedResult
  passwords: {
    vam1: string
    vaf1: string
  }
  message: string
}

const STUDIO_ZONE = 10105
const VAM_LOGOUT_X = 50000
const VAM_LOGOUT_Y = 50000
const VAF_LOGOUT_X = -50000
const VAF_LOGOUT_Y = -50000

export function defaultVamPassword(): string {
  return process.env.PORTRAIT_VAM1_PASS?.trim() || "vam1vam1"
}

export function defaultVafPassword(): string {
  return process.env.PORTRAIT_VAF1_PASS?.trim() || "vaf1vaf1"
}

function hashPassword(password: string, salt: string): string {
  return crypto.createHash("sha512").update(password + salt).digest("hex")
}

function uuidTo16Bytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex")
}

function updateCharactersBlob(
  existingBlob: Uint8Array | Buffer | null | undefined,
  charUuid: string
): Buffer {
  const buf = Buffer.alloc(320)
  if (existingBlob && existingBlob.length > 0) {
    Buffer.from(existingBlob).copy(buf, 0, 0, Math.min(320, existingBlob.length))
  }
  const charBytes = uuidTo16Bytes(charUuid)

  // If already present in any 16-byte slot, return as is
  for (let i = 0; i < 20; i++) {
    const slot = buf.subarray(i * 16, (i + 1) * 16)
    if (slot.equals(charBytes)) {
      return buf
    }
  }

  // Set in slot 0 (primary mannequin character)
  charBytes.copy(buf, 0)
  return buf
}

function withDbWrite<T>(dbPath: string, fn: (db: DatabaseSync) => T): T {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file does not exist at ${dbPath}`)
  }
  const db = new DatabaseSync(dbPath)
  try {
    db.exec("PRAGMA busy_timeout = 5000")
    return fn(db)
  } finally {
    try {
      db.close()
    } catch {
      /* ignore close error */
    }
  }
}

/**
 * Overview of vam1 & vaf1 accounts and their characters.
 */
export function getStudioAccountsOverview(): StudioAccountsOverview {
  const lobbyPath = getLobbyDbPath()
  const worldPath = getWorldDbPath()

  if (!fs.existsSync(lobbyPath)) {
    throw new LobbyDbMissingError(lobbyPath)
  }
  if (!fs.existsSync(worldPath)) {
    throw new WorldDbMissingError(worldPath)
  }

  const lobbyDb = new DatabaseSync(lobbyPath, { readOnly: true })
  const worldDb = new DatabaseSync(worldPath, { readOnly: true })

  try {
    lobbyDb.exec("PRAGMA busy_timeout = 5000")
    worldDb.exec("PRAGMA busy_timeout = 5000")
    const checkRole = (
      username: "vam1" | "vaf1",
      expectedCharName: "vam" | "vaf"
    ): StudioMannequinAccountStatus => {
      const accountRow = lobbyDb
        .prepare(
          `SELECT UID, Username, DisplayName, Email, UserLevel, Enabled
           FROM Account WHERE Username = ?`
        )
        .get(username) as
        | {
            UID: string
            Username: string
            DisplayName: string
            Email: string
            UserLevel: number | null
            Enabled: number | null
          }
        | undefined

      const charRow = worldDb
        .prepare(
          `SELECT UID, Name, Gender, LogoutZone
           FROM Character WHERE Name = ?`
        )
        .get(expectedCharName) as
        | {
            UID: string
            Name: string
            Gender: number
            LogoutZone: number | null
          }
        | undefined

      const userLevel = accountRow?.UserLevel ?? 0
      const exists = Boolean(accountRow)
      const isAdmin = userLevel >= ADMIN_USER_LEVEL
      const enabled = Boolean(accountRow?.Enabled)

      return {
        username,
        exists,
        userLevel,
        isAdmin,
        enabled,
        characterName: charRow ? charRow.Name : null,
        characterExists: Boolean(charRow),
        characterGender: charRow ? charRow.Gender : null,
        characterZone: charRow ? charRow.LogoutZone : null,
        accountUid: accountRow?.UID ?? null,
        characterUid: charRow?.UID ?? null,
      }
    }

    return {
      vam1: checkRole("vam1", "vam"),
      vaf1: checkRole("vaf1", "vaf"),
    }
  } finally {
    try {
      lobbyDb.close()
    } catch {
      /* ignore */
    }
    try {
      worldDb.close()
    } catch {
      /* ignore */
    }
  }
}

type SeedSingleRoleConfig = {
  username: "vam1" | "vaf1"
  charName: "vam" | "vaf"
  gender: 0 | 1 // 0: male, 1: female
  skinType: number
  hairType: number
  faceType: number
  eyeType: number
  hairColor: number
  eyeColor: number
  logoutX: number
  logoutY: number
  password: string
}

function seedRoleInDatabases(
  lobbyDb: DatabaseSync,
  worldDb: DatabaseSync,
  config: SeedSingleRoleConfig
): StudioRoleSeedResult {
  const {
    username,
    charName,
    gender,
    skinType,
    hairType,
    faceType,
    eyeType,
    hairColor,
    eyeColor,
    logoutX,
    logoutY,
    password,
  } = config

  let accountCreated = false
  let adminGranted = false
  let characterCreated = false

  // 1. Check or create character in worldDb first to get charUid
  let existingChar = worldDb
    .prepare(
      `SELECT UID, Name, Account, CoreStats, LogoutZone, COMP, Progress, FriendSettings
       FROM Character WHERE Name = ?`
    )
    .get(charName) as
    | {
        UID: string
        Name: string
        Account: string
        CoreStats: string
        LogoutZone: number
        COMP: string
        Progress: string
        FriendSettings: string
      }
    | undefined

  let charUid: string
  if (existingChar) {
    charUid = existingChar.UID
  } else {
    charUid = crypto.randomUUID()
    characterCreated = true
  }

  // 2. Account in lobbyDb
  const existingAccount = lobbyDb
    .prepare(
      `SELECT UID, Username, Password, Salt, UserLevel, Enabled, Characters
       FROM Account WHERE Username = ?`
    )
    .get(username) as
    | {
        UID: string
        Username: string
        Password: string
        Salt: string
        UserLevel: number | null
        Enabled: number | null
        Characters: Uint8Array | Buffer | null
      }
    | undefined

  let accountUid: string
  const salt = existingAccount?.Salt || crypto.randomBytes(5).toString("hex")
  const passwordHash = hashPassword(password, salt)

  if (existingAccount) {
    accountUid = existingAccount.UID
    const updatedChars = updateCharactersBlob(existingAccount.Characters, charUid)
    lobbyDb
      .prepare(
        `UPDATE Account
         SET Password = ?, Salt = ?, UserLevel = ?, Enabled = 1, Characters = ?, DisplayName = ?
         WHERE Username = ?`
      )
      .run(
        passwordHash,
        salt,
        ADMIN_USER_LEVEL,
        updatedChars,
        username,
        username
      )
    adminGranted = true
  } else {
    accountUid = crypto.randomUUID()
    accountCreated = true
    adminGranted = true
    const charsBlob = updateCharactersBlob(null, charUid)
    lobbyDb
      .prepare(
        `INSERT INTO Account (
          UID, Username, DisplayName, Email, Password, Salt, CP, TicketCount,
          UserLevel, Enabled, APIOnly, LastLogin, LastLogout, BanReason, BanInitiator, Characters
        ) VALUES (
          ?, ?, ?, ?, ?, ?, 1000000, 0,
          ?, 1, 0, 0, 0, '', '', ?
        )`
      )
      .run(
        accountUid,
        username,
        username,
        `noreply+${username}@local.invalid`,
        passwordHash,
        salt,
        ADMIN_USER_LEVEL,
        charsBlob
      )
  }

  // 3. Ensure Character and supporting tables in worldDb
  if (existingChar) {
    // Update account link, zone, and position
    worldDb
      .prepare(
        `UPDATE Character
         SET Account = ?, LogoutZone = ?, LogoutX = ?, LogoutY = ?, Gender = ?
         WHERE UID = ?`
      )
      .run(accountUid, STUDIO_ZONE, logoutX, logoutY, gender, charUid)

    // Ensure EntityStats exists
    const stats = worldDb
      .prepare(`SELECT UID FROM EntityStats WHERE UID = ? OR Entity = ?`)
      .get(existingChar.CoreStats || "", charUid) as { UID: string } | undefined

    if (!stats) {
      const statsUid = existingChar.CoreStats || crypto.randomUUID()
      worldDb
        .prepare(
          `INSERT INTO EntityStats (
            UID, Entity, Level, XP, HP, MP, MaxHP, MaxMP,
            STR, MAGIC, VIT, INTEL, SPEED, LUCK,
            CLSR, LNGR, SPELL, SUPPORT, PDEF, MDEF
          ) VALUES (
            ?, ?, 1, 0, 73, ?, 73, ?,
            1, 1, 1, 1, 1, 1,
            0, 0, 0, 0, 0, 0
          )`
        )
        .run(statsUid, charUid, gender === 1 ? 11 : 13, gender === 1 ? 11 : 13)

      if (!existingChar.CoreStats) {
        worldDb
          .prepare(`UPDATE Character SET CoreStats = ? WHERE UID = ?`)
          .run(statsUid, charUid)
      }
    }
  } else {
    // Create fresh character + all required rows
    const statsUid = crypto.randomUUID()
    const compUid = crypto.randomUUID()
    const itemBoxUid = crypto.randomUUID()
    const friendUid = crypto.randomUUID()
    const progUid = crypto.randomUUID()
    const hotbarUid = crypto.randomUUID()

    // EntityStats
    worldDb
      .prepare(
        `INSERT INTO EntityStats (
          UID, Entity, Level, XP, HP, MP, MaxHP, MaxMP,
          STR, MAGIC, VIT, INTEL, SPEED, LUCK,
          CLSR, LNGR, SPELL, SUPPORT, PDEF, MDEF
        ) VALUES (
          ?, ?, 1, 0, 73, ?, 73, ?,
          1, 1, 1, 1, 1, 1,
          0, 0, 0, 0, 0, 0
        )`
      )
      .run(statsUid, charUid, gender === 1 ? 11 : 13, gender === 1 ? 11 : 13)

    // ItemBoxes buffer: 5 slots of 16-bytes (80 bytes total). Slot 0 = itemBoxUid
    const itemBoxesBuf = Buffer.alloc(80)
    uuidTo16Bytes(itemBoxUid).copy(itemBoxesBuf, 0)

    // Hotbars buffer: 10 slots of 16-bytes (160 bytes total). Slot 0 = hotbarUid
    const hotbarsBuf = Buffer.alloc(160)
    uuidTo16Bytes(hotbarUid).copy(hotbarsBuf, 0)

    // Empty buffers for required BLOB columns
    const empty4 = Buffer.alloc(4)
    const learnedSkills = Buffer.alloc(168)
    const equippedItems = Buffer.alloc(240)
    const equippedVA = Buffer.alloc(64)
    const vaCloset = Buffer.alloc(200)
    const expertises = Buffer.alloc(608)
    const autoRecovery = Buffer.alloc(20)
    const customTitles = Buffer.alloc(130)

    worldDb
      .prepare(
        `INSERT INTO Character (
          UID, Name, Account, WorldID, KillTime, Gender,
          SkinType, HairType, FaceType, EyeType, HairColor, LeftEyeColor, RightEyeColor,
          LNC, Points, ExpertiseExtension, COMP, ActiveDemon,
          HomepointZone, HomepointSpotID, LogoutZone, LogoutInstance, LogoutX, LogoutY, LogoutRotation,
          PreviousZone, LoginPoints, LastLogin, Clan, CurrentTitle, TitlePrioritized, SupportDisplay, FusionGauge,
          LearnedSkills, EquippedItems, EquippedVA, Materials, ItemBoxes, VACloset,
          Expertises, StatusEffects, Quests, Hotbars, CommonSwitch, AutoRecovery,
          CustomTitles, ActionCooldowns, CoreStats, Progress, FriendSettings,
          DemonQuest, CultureData, PvPData
        ) VALUES (
          ?, ?, ?, 0, 0, ?,
          ?, ?, ?, ?, ?, ?, ?,
          0, 0, 0, ?, '00000000-0000-0000-0000-000000000000',
          90105, 50000, ?, 0, ?, ?, -3.14159,
          90105, 1, 0, '00000000-0000-0000-0000-000000000000', 0, 0, 0, 0,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000'
        )`
      )
      .run(
        charUid,
        charName,
        accountUid,
        gender,
        skinType,
        hairType,
        faceType,
        eyeType,
        hairColor,
        eyeColor,
        eyeColor,
        compUid,
        STUDIO_ZONE,
        logoutX,
        logoutY,
        learnedSkills,
        equippedItems,
        equippedVA,
        empty4,
        itemBoxesBuf,
        vaCloset,
        expertises,
        empty4,
        empty4,
        hotbarsBuf,
        empty4,
        autoRecovery,
        customTitles,
        empty4,
        statsUid,
        progUid,
        friendUid
      )

    // Insert ItemBox
    worldDb
      .prepare(
        `INSERT INTO ItemBox (UID, BoxID, Type, Account, Character, Items, RentalExpiration)
         VALUES (?, 0, 0, ?, ?, ?, 0)`
      )
      .run(itemBoxUid, accountUid, charUid, Buffer.alloc(800))

    // Insert DemonBox
    worldDb
      .prepare(
        `INSERT INTO DemonBox (UID, BoxID, Account, Character, Demons, RentalExpiration)
         VALUES (?, 0, ?, ?, ?, 0)`
      )
      .run(compUid, accountUid, charUid, Buffer.alloc(800))

    // Insert FriendSettings
    worldDb
      .prepare(
        `INSERT INTO FriendSettings (UID, Character, FriendMessage, Friends, PublicToZone)
         VALUES (?, ?, '', ?, 1)`
      )
      .run(friendUid, charUid, empty4)

    // Insert CharacterProgress
    worldDb
      .prepare(
        `INSERT INTO CharacterProgress (
          UID, Character, MaxCOMPSlots, Maps, Plugins, Valuables,
          CompletedQuests, DemonQuestSequence, DemonQuestsCompleted, DemonQuestDaily, DemonQuestResetTime,
          TimeTrialID, TimeTrialTime, TimeTrialResult, TimeTrialRecords, Titles,
          SpecialTitles, Coins, ITimePoints, Bethel, Cowrie,
          DigitalizeLevels, DigitalizePoints, DigitalizeAssists
        ) VALUES (
          ?, ?, 6, ?, ?, ?,
          ?, 0, ?, 0, 0,
          -1, 0, -1, ?, ?,
          ?, 0, ?, ?, 0,
          ?, ?, ?
        )`
      )
      .run(
        progUid,
        charUid,
        Buffer.alloc(32),
        Buffer.alloc(32),
        Buffer.alloc(128),
        Buffer.alloc(128),
        empty4,
        Buffer.alloc(56),
        Buffer.alloc(4),
        Buffer.alloc(128),
        empty4,
        Buffer.alloc(20),
        empty4,
        empty4,
        Buffer.alloc(256)
      )

    // Insert Hotbar
    worldDb
      .prepare(
        `INSERT INTO Hotbar (UID, Character, PageID, ItemTypes, Items, ItemIDs)
         VALUES (?, ?, 0, ?, ?, ?)`
      )
      .run(hotbarUid, charUid, Buffer.alloc(16), Buffer.alloc(256), Buffer.alloc(64))
  }

  return {
    account: username,
    accountCreated,
    adminGranted,
    character: charName,
    characterCreated,
    gender: gender === 0 ? "male" : "female",
    zone: STUDIO_ZONE,
  }
}

/**
 * Seed or update mannequin accounts (vam1, vaf1) and their characters (vam, vaf).
 * Sets both accounts to admin (userLevel=1000), enabled, placed in studio zone 10105.
 */
export async function seedStudioMannequins(
  options?: StudioSeedOptions
): Promise<StudioSeedResult> {
  const lobbyPath = getLobbyDbPath()
  const worldPath = getWorldDbPath()

  if (!fs.existsSync(lobbyPath)) {
    throw new LobbyDbMissingError(lobbyPath)
  }
  if (!fs.existsSync(worldPath)) {
    throw new WorldDbMissingError(worldPath)
  }

  const vamPassword = options?.vamPass?.trim() || defaultVamPassword()
  const vafPassword = options?.vafPass?.trim() || defaultVafPassword()

  if (vamPassword.length < 6 || vamPassword.length > 16) {
    throw new Error("vam1 password must be between 6 and 16 characters")
  }
  if (vafPassword.length < 6 || vafPassword.length > 16) {
    throw new Error("vaf1 password must be between 6 and 16 characters")
  }

  const vamConfig: SeedSingleRoleConfig = {
    username: "vam1",
    charName: "vam",
    gender: 0,
    skinType: 101,
    hairType: 1,
    faceType: 1,
    eyeType: 1,
    hairColor: 8,
    eyeColor: 8,
    logoutX: VAM_LOGOUT_X,
    logoutY: VAM_LOGOUT_Y,
    password: vamPassword,
  }

  const vafConfig: SeedSingleRoleConfig = {
    username: "vaf1",
    charName: "vaf",
    gender: 1,
    skinType: 202,
    hairType: 110,
    faceType: 105,
    eyeType: 102,
    hairColor: 56,
    eyeColor: 95,
    logoutX: VAF_LOGOUT_X,
    logoutY: VAF_LOGOUT_Y,
    password: vafPassword,
  }

  let vamResult: StudioRoleSeedResult
  let vafResult: StudioRoleSeedResult

  withDbWrite(lobbyPath, (lobbyDb) => {
    withDbWrite(worldPath, (worldDb) => {
      lobbyDb.exec("BEGIN IMMEDIATE")
      worldDb.exec("BEGIN IMMEDIATE")
      try {
        vamResult = seedRoleInDatabases(lobbyDb, worldDb, vamConfig)
        vafResult = seedRoleInDatabases(lobbyDb, worldDb, vafConfig)
        worldDb.exec("COMMIT")
        lobbyDb.exec("COMMIT")
      } catch (err) {
        try {
          worldDb.exec("ROLLBACK")
        } catch {
          /* ignore */
        }
        try {
          lobbyDb.exec("ROLLBACK")
        } catch {
          /* ignore */
        }
        throw err
      }
    })
  })

  // Clear in-memory caches
  resetLobbyDbCache()
  resetWorldDbCache()

  // Optional: best-effort sync with lobby API if comp session provided
  if (options?.auth) {
    try {
      await adminUpdateAccount(options.auth, {
        username: "vam1",
        password: vamPassword,
        user_level: ADMIN_USER_LEVEL,
        enabled: true,
      })
    } catch {
      /* lobby API sync best-effort */
    }
    try {
      await adminUpdateAccount(options.auth, {
        username: "vaf1",
        password: vafPassword,
        user_level: ADMIN_USER_LEVEL,
        enabled: true,
      })
    } catch {
      /* lobby API sync best-effort */
    }
  }

  const message = `Seeded vam1 (char: vam) and vaf1 (char: vaf) with admin rights in studio zone ${STUDIO_ZONE}.`

  return {
    ok: true,
    vam: vamResult!,
    vaf: vafResult!,
    passwords: {
      vam1: vamPassword,
      vaf1: vafPassword,
    },
    message,
  }
}
