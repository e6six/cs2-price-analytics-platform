import { getMarketDirectory } from "@/lib/cs2-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const markets = await getMarketDirectory();
    return Response.json({ markets, demo: true });
  } catch (error) {
    console.error("GET /api/markets failed", error);
    return Response.json({ error: "Не удалось загрузить справочник площадок" }, { status: 500 });
  }
}
