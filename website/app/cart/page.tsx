import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ShoppingCart } from "lucide-react"

import { CartPanel } from "@/features/store/components/CartPanel"
import { getServerUser } from "@/features/auth/server"
import { isStoreCartEnabled } from "@/lib/store-prices-store"

export const metadata: Metadata = {
  title: "Cart",
}

export default async function CartPage() {
  const user = await getServerUser()
  if (!user) {
    redirect("/login")
  }

  if (!isStoreCartEnabled()) {
    return (
      <div className="mx-auto max-w-lg space-y-3 py-8 text-center">
        <ShoppingCart
          className="mx-auto size-8 text-muted-foreground/50"
          aria-hidden
        />
        <h1 className="font-heading text-xl tracking-wide uppercase">
          Store closed
        </h1>
        <p className="text-sm text-muted-foreground">
          The web store cart is temporarily disabled. Browse the wiki as usual —
          checkout will return when an admin turns it back on.
        </p>
        <Link
          href="/wiki"
          className="inline-block text-sm text-gold-dim underline hover:text-gold"
        >
          Back to wiki
        </Link>
      </div>
    )
  }

  return <CartPanel />
}
