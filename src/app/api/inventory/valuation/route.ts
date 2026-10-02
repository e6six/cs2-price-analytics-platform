import { getReadyDb } from "@/db";
import { badRequest, route, serviceUnavailable } from "@/lib/api/http";
import { HttpError } from "@/lib/http";
import {
  fetchPublicSteamInventory,
  normalizeSteamId64,
  PrivateSteamInventoryError,
  valueSteamInventory,
} from "@/lib/inventory/steam";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const requestSchema = z.object({ steamId64: z.string().min(1).max(200) });

/** Оценивает открытый CS2-инвентарь по сохранённым последним котировкам. */
export const POST = route(async (request) => {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest("Передайте steamId64: 17-значный SteamID64 или ссылку steamcommunity.com/profiles/{SteamID64}");
  }

  const steamId64 = normalizeSteamId64(parsed.data.steamId64);
  if (!steamId64) {
    throw badRequest("Не удалось распознать SteamID64. Vanity-ссылки /id/... не поддерживаются; укажите 17-значный ID из /profiles/...");
  }

  const db = await getReadyDb();
  let snapshot;
  try {
    // The server-side cache shares in-flight page requests across concurrent
    // callers, so do not bind the underlying fetch to one browser connection.
    snapshot = await fetchPublicSteamInventory(steamId64);
  } catch (error) {
    if (error instanceof PrivateSteamInventoryError) {
      throw badRequest("Steam сообщает, что инвентарь профиля закрыт. Сделайте CS2-инвентарь публичным и попробуйте снова.");
    }
    if (error instanceof HttpError && error.status === 403) {
      throw badRequest("Steam не отдаёт этот инвентарь. Проверьте, что CS2-инвентарь профиля открыт для просмотра.");
    }
    if (error instanceof HttpError && error.status === 429) {
      throw serviceUnavailable("Steam временно ограничил запросы к инвентарю. Подождите несколько минут и попробуйте снова.");
    }
    if (error instanceof HttpError && error.status === 404) {
      throw badRequest("Профиль или CS2-инвентарь не найден.");
    }
    if (error instanceof Error && error.message) {
      throw serviceUnavailable(`Не удалось получить публичный инвентарь Steam: ${error.message}`);
    }
    throw serviceUnavailable("Не удалось получить публичный инвентарь Steam.");
  }

  const valuation = await valueSteamInventory(db, steamId64, snapshot);
  return {
    ...valuation,
    notes: [
      "Оценка валовая: Steam Market показывает средства Steam Wallet, их нельзя вывести как наличные.",
      "Для внешней оценки используется самая низкая сохранённая котировка среди подключённых площадок; возраст цены указан отдельно.",
      "Одинаковые market_hash_name оцениваются одной ценой; float, наклейки, редкие паттерны и износ внутри класса могут менять стоимость конкретного предмета.",
      "Инвентарь читается только если он публичен. Данные инвентаря не записываются в базу; кэш Steam в памяти сервера — до 60 секунд.",
    ],
  };
});
