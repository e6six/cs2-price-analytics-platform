import { getItemDetail } from "@/lib/cs2-data";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const itemId = Number.parseInt(id, 10);
    if (!Number.isSafeInteger(itemId) || itemId < 1) {
      return Response.json({ error: "Некорректный идентификатор предмета" }, { status: 400 });
    }

    const requestedRange = new URL(request.url).searchParams.get("range") ?? "365d";
    const rangeDays = requestedRange === "7d" ? 7 : requestedRange === "30d" ? 30 : requestedRange === "90d" ? 90 : 365;
    const detail = await getItemDetail(itemId, rangeDays);
    if (!detail) return Response.json({ error: "Предмет не найден" }, { status: 404 });

    return Response.json({ itemId, range: requestedRange, history: detail.history, demo: true });
  } catch (error) {
    console.error("GET /api/items/[id]/history failed", error);
    return Response.json({ error: "Не удалось загрузить историю" }, { status: 500 });
  }
}
