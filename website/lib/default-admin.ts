/** Default GM from setup.xml / deploy seed — force change on first web login. */
export const DEFAULT_ADMIN_USERNAME = "admin"
export const DEFAULT_ADMIN_PASSWORD = "admin123"

/** site_settings key — skip prompt until cleared (e.g. wipe web.sqlite). */
export const SKIP_DEFAULT_ADMIN_PASSWORD_PROMPT_KEY =
  "skip_default_admin_password_prompt"

export function isDefaultAdminCredentials(
  username: string,
  password: string
): boolean {
  return (
    username.trim().toLowerCase() === DEFAULT_ADMIN_USERNAME &&
    password === DEFAULT_ADMIN_PASSWORD
  )
}
