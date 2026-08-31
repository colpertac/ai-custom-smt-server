import Link from "next/link"

export function WikiUnavailable() {
  return (
    <div className="site-atmosphere mx-auto max-w-2xl px-4 py-16">
      <h1 className="font-heading text-3xl font-semibold tracking-[0.1em] uppercase">
        Item wiki
      </h1>
      <div className="gold-rule mt-3 max-w-xs" />
      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
        The item wiki stays off until character art data (BinaryData) from your
        game client is uploaded. That avoids showing a stock catalog that may
        not match this server.
      </p>
      <p className="mt-4 text-sm text-muted-foreground">
        An admin can upload it from{" "}
        <Link href="/admin" className="text-gold-dim hover:text-gold-hot">
          Admin → Game files
        </Link>
        .
      </p>
    </div>
  )
}
