import { getOfficeScene } from "@/lib/office-scene"
import { LandingPage } from "@/components/landing/landing-page"

// Public landing page. The proxy sends signed-in users straight to /dashboard
export default async function Home() {
  const scene = await getOfficeScene("/offices/office-warm.png")
  return <LandingPage scene={scene} />
}
