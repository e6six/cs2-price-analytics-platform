import { getItemDetail } from "@/lib/cs2-data";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const itemId = Number.parseInt(id, 10);
    if (!Number.isSafeInteger(itemId) || itemId < 1) {
      return Response.json({ error: "Некорректный идентификатор предмета" }, { status: 400 });
    }

    const detail = await getItemDetail(itemId);
    if (!detail) return Response.json({ error: "Предмет не найден" }, { status: 404 });
    return Response.json({ ...detail, demo: true });
  } catch (error) {
    console.error("GET /api/items/[id] failed", error);
    return Response.json({ error: "Не удалось загрузить предмет" }, { status: 500 });
  }
}
