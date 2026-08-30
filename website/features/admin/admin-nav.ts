import type { LucideIcon } from "lucide-react"
import {
  Coins,
  Download,
  Flag,
  FolderArchive,
  LayoutDashboard,
  Mail,
  MessageSquareText,
  Newspaper,
  Palette,
  Settings,
  Store,
  Ticket,
  Upload,
  Users,
} from "lucide-react"

export type AdminNavItem = {
  href: string
  label: string
  icon: LucideIcon
  /** Exact match for /admin; prefix match for nested routes */
  match: "exact" | "prefix"
}

export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, match: "exact" },
  { href: "/admin/accounts", label: "Accounts", icon: Users, match: "prefix" },
  { href: "/admin/reports", label: "Reports", icon: Flag, match: "prefix" },
  {
    href: "/admin/chat-logs",
    label: "Chat logs",
    icon: MessageSquareText,
    match: "prefix",
  },
  { href: "/admin/news", label: "News", icon: Newspaper, match: "prefix" },
  { href: "/admin/download", label: "Download", icon: Download, match: "prefix" },
  { href: "/admin/email", label: "Email", icon: Mail, match: "prefix" },
  {
    href: "/admin/game-files",
    label: "Game files",
    icon: FolderArchive,
    match: "prefix",
  },
  { href: "/admin/config", label: "Config", icon: Settings, match: "prefix" },
  { href: "/admin/shops", label: "Shops", icon: Store, match: "prefix" },
  { href: "/admin/promos", label: "Promos", icon: Ticket, match: "prefix" },
  { href: "/admin/payouts", label: "Payouts", icon: Coins, match: "prefix" },
  { href: "/admin/studio", label: "Studio", icon: Palette, match: "prefix" },
  { href: "/admin/import", label: "Import", icon: Upload, match: "prefix" },
]

export function adminPageTitle(pathname: string): string {
  if (pathname === "/admin" || pathname === "/admin/") return "Overview"
  if (pathname.startsWith("/admin/accounts")) return "Accounts"
  if (pathname.startsWith("/admin/reports")) return "Reports"
  if (pathname.startsWith("/admin/chat-logs")) return "Chat logs"
  if (pathname.startsWith("/admin/news")) return "News"
  if (pathname.startsWith("/admin/download")) return "Download"
  if (pathname.startsWith("/admin/email")) return "Email"
  if (pathname.startsWith("/admin/game-files")) return "Game files"
  if (pathname.startsWith("/admin/config")) return "Config"
  if (pathname.startsWith("/admin/shops")) return "Shops"
  if (pathname.startsWith("/admin/promos")) return "Promos"
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
