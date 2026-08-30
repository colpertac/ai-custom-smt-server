export type AdminNavItem = {
  href: string
  label: string
  /** Exact match for /admin; prefix match for nested routes */
  match: "exact" | "prefix"
}

export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", label: "Overview", match: "exact" },
  { href: "/admin/accounts", label: "Accounts", match: "prefix" },
  { href: "/admin/news", label: "News", match: "prefix" },
  { href: "/admin/game-files", label: "Game files", match: "prefix" },
  { href: "/admin/config", label: "Config", match: "prefix" },
  { href: "/admin/shops", label: "Shops", match: "prefix" },
  { href: "/admin/payouts", label: "Payouts", match: "prefix" },
  { href: "/admin/studio", label: "Studio", match: "prefix" },
  { href: "/admin/import", label: "Import", match: "prefix" },
]

export function adminPageTitle(pathname: string): string {
  if (pathname === "/admin" || pathname === "/admin/") return "Overview"
  if (pathname.startsWith("/admin/accounts")) return "Accounts"
  if (pathname.startsWith("/admin/news")) return "News"
  if (pathname.startsWith("/admin/game-files")) return "Game files"
  if (pathname.startsWith("/admin/config")) return "Config"
  if (pathname.startsWith("/admin/shops")) return "Shops"
  if (pathname.startsWith("/admin/payouts")) return "Payouts"
  if (pathname.startsWith("/admin/studio")) return "Studio"
  if (pathname.startsWith("/admin/import")) return "Import"
  return "Admin"
}

export function navItemActive(item: AdminNavItem, pathname: string): boolean {
  if (item.match === "exact") {
    return pathname === "/admin" || pathname === "/admin/"
  }
  return pathname.startsWith(item.href)
}
