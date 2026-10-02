import { getItemsList } from "@/lib/cs2-data";

export const dynamic = "force-dynamic";

function readBoolean(value: string | null) {
  return value === "1" || value === "true";
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const pageValue = Number.parseInt(params.get("page") ?? "1", 10);
    const limitValue = Number.parseInt(params.get("limit") ?? "30", 10);
    const result = await getItemsList({
      query: params.get("q") ?? params.get("search") ?? undefined,
      category: params.get("category") ?? undefined,
      weapon: params.get("weapon") ?? undefined,
      rarity: params.get("rarity") ?? undefined,
      collection: params.get("collection") ?? undefined,
      wear: params.get("wear") ?? undefined,
      stattrak: readBoolean(params.get("stattrak")),
      souvenir: readBoolean(params.get("souvenir")),
      sort: params.get("sort") ?? undefined,
      page: Number.isFinite(pageValue) ? pageValue : 1,
      limit: Number.isFinite(limitValue) ? limitValue : 30,
    });

    return Response.json({ ...result, demo: true });
  } catch (error) {
    console.error("GET /api/items failed", error);
    return Response.json({ error: "Не удалось загрузить каталог" }, { status: 500 });
  }
}
