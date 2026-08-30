import { cn } from "@/lib/utils"

/** High-contrast form-level error / notice banner for dark slate theme. */
export function FormAlert({
  children,
  variant = "error",
  className,
  role,
}: {
  children: React.ReactNode
  variant?: "error" | "success"
  className?: string
  role?: "alert" | "status"
}) {
  return (
    <p
      role={role ?? (variant === "error" ? "alert" : "status")}
      className={cn(
        "border px-3 py-2 text-sm font-medium leading-snug",
        variant === "error" &&
          "border-[#e05555] bg-[#3a1010] text-[#ffc9c9]",
        variant === "success" &&
          "border-gold-dim/70 bg-primary/15 text-gold-hot",
        className
      )}
    >
      {children}
    </p>
  )
}

/** Inline field validation message — bright enough on slate panels. */
export function FieldMessage({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <p
      role="alert"
      className={cn("text-sm font-medium text-[#ff9b9b]", className)}
    >
      {children}
    </p>
  )
}
