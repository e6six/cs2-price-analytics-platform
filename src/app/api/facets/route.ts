import { getReadyDb } from "@/db";
import { route } from "@/lib/api/http";
import { getFacets } from "@/lib/analytics/queries";

export const dynamic = "force-dynamic";

/** Значения фильтров каталога с числом предметов — для построения панели фильтров. */
export const GET = route(
  async () => {
    const db = await getReadyDb();
    const facets = await getFacets(db);
    return { facets };
  },
  { cache: { sMaxAge: 900, staleWhileRevalidate: 3_600 } },
);
