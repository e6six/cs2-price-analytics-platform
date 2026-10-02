import { Dashboard } from "@/components/dashboard";
import { getDashboardSnapshot } from "@/lib/cs2-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const snapshot = await getDashboardSnapshot();
  return <Dashboard initialData={snapshot} />;
}
