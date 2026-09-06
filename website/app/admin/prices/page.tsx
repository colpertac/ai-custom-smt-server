import { redirect } from "next/navigation"

/** Legacy path — store settings moved to /admin/store. */
export default function AdminPricesRedirect() {
  redirect("/admin/store")
}
