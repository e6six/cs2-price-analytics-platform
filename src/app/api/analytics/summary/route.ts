import { getAnalyticsSummary } from "@/lib/cs2-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getAnalyticsSummary());
  } catch (error) {
    console.error("GET /api/analytics/summary failed", error);
    return Response.json({ error: "Не удалось загрузить сводную аналитику" }, { status: 500 });
  }
}
