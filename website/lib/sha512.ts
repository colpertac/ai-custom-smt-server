import { createHash } from "node:crypto"

/** COMP lobby expects lowercase hex SHA-512 digests. */
export function sha512Hex(input: string): string {
  return createHash("sha512").update(input, "utf8").digest("hex")
}

export function passwordHash(password: string, salt: string): string {
  return sha512Hex(password + salt)
}

export function challengeReply(
  passwordHashValue: string,
  challenge: string
): string {
  return sha512Hex(passwordHashValue + challenge)
}
