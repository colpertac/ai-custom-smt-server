"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSyncExternalStore } from "react"
import { ShoppingCart } from "lucide-react"

import { useSessionUser } from "@/features/auth/hooks"
import {
  CART_CHANGED_EVENT,
  cartItemCount,
  readCart,
} from "@/features/store/cart-storage"
import { cn } from "@/lib/utils"

const navClass =
  "inline-flex shrink-0 items-center gap-1 text-xs uppercase text-nav-muted transition-colors hover:text-gold-dim no-underline tracking-[var(--density-nav-tracking)]"

function subscribeCart(onStoreChange: () => void): () => void {
  window.addEventListener(CART_CHANGED_EVENT, onStoreChange)
  window.addEventListener("storage", onStoreChange)
  return () => {
    window.removeEventListener(CART_CHANGED_EVENT, onStoreChange)
    window.removeEventListener("storage", onStoreChange)
  }
}

function getCountSnapshot(): number {
  return cartItemCount(readCart())
}

function getServerCountSnapshot(): number {
  return 0
}

/** Header cart link — only rendered when logged in. */
export function CartNavLink() {
  const pathname = usePathname()
  const { data: session, isLoading } = useSessionUser()
  const count = useSyncExternalStore(
    subscribeCart,
    getCountSnapshot,
    getServerCountSnapshot
  )

  if (isLoading || !session) return null

  return (
    <Link
      href="/cart"
      className={cn(navClass, pathname.startsWith("/cart") && "text-gold")}
      aria-label={count > 0 ? `Cart, ${count} items` : "Cart"}
    >
      <ShoppingCart className="size-3.5 opacity-80" aria-hidden />
      Cart
      {count > 0 ? (
        <span className="ml-0.5 inline-flex min-w-4 items-center justify-center rounded-sm bg-gold/20 px-1 font-mono text-[0.65rem] text-gold tabular-nums">
          {count}
        </span>
      ) : null}
    </Link>
  )
}
