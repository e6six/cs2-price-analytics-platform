import { getReadyDb } from "@/db";
import { route, parseQuery } from "@/lib/api/http";
import { parseItemsQuery, toCatalogFilters } from "@/lib/api/validation";
import { getCatalog } from "@/lib/analytics/queries";

export const dynamic = "force-dynamic";

/** Каталог предметов: фильтры, сортировки и пагинация на стороне SQL. */
export const GET = route(
  async (request) => {
    const query = parseItemsQuery(parseQuery(request));
    const db = await getReadyDb();
    const result = await getCatalog(db, toCatalogFilters(query));

    return {
      ...result,
      filters: {
        q: query.q ?? null,
        category: query.category ?? null,
        kind: query.kind ?? null,
        weapon: query.weapon ?? null,
        rarity: query.rarity ?? null,
        collection: query.collection ?? null,
        wear: query.wear ?? null,
        market: query.market ?? null,
        stattrak: query.stattrak,
        souvenir: query.souvenir,
      },
    };
  },
  { cache: { sMaxAge: 120, staleWhileRevalidate: 600 } },
);
