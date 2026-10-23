import { redirect } from "next/navigation"

// The proxy sends signed-out visitors on to /sign-in
export default function Home() {
  redirect("/dashboard")
}
