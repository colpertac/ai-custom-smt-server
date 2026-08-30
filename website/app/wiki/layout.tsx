import { WikiShell } from "@/features/wiki/components/WikiShell"

export default function WikiLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <WikiShell>{children}</WikiShell>
}
