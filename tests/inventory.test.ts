import assert from "node:assert/strict";
import test from "node:test";
import { ZodError } from "zod";
import type { InventoryItemView, InventoryPriceView } from "@/lib/analytics/types";
import {
  calculateInventoryTotals,
  normalizeSteamId64,
  parseSteamInventoryPage,
  PrivateSteamInventoryError,
} from "@/lib/inventory/steam";
import { getSteamRefreshCooldown } from "@/lib/steam/refresh-cooldown";

const price = (priceUsd: number): InventoryPriceView => ({
  marketId: "steam-community",
  price: priceUsd,
  currency: "USD",
  priceUsd,
  capturedAt: "2026-10-02T12:00:00.000Z",
  sourceUrl: null,
  isLive: true,
  ageHours: 0,
  isStale: false,
});

test("Steam ID normalizer accepts numeric SteamID64 and public profile URLs", () => {
  const id = "76561198000000000";
  assert.equal(normalizeSteamId64(id), id);
  assert.equal(normalizeSteamId64(`https://steamcommunity.com/profiles/${id}/`), id);
  assert.equal(normalizeSteamId64(`http://steamcommunity.com/profiles/${id}`), id);
});

test("Steam ID normalizer rejects vanity URLs, short IDs and unrelated URLs", () => {
  assert.equal(normalizeSteamId64("7656119800000000"), null);
  assert.equal(normalizeSteamId64("https://steamcommunity.com/id/example"), null);
  assert.equal(normalizeSteamId64("https://example.com/profiles/76561198000000000"), null);
});

test("inventory valuation counts only marketable, priced assets in money totals", () => {
  const items: InventoryItemView[] = [
    {
      name: "AK-47 | Redline (Field-Tested)",
      marketHashName: "AK-47 | Redline (Field-Tested)",
      imageUrl: null,
      amount: 2,
      assetCount: 2,
      marketable: true,
      steam: price(1.5),
      external: price(2),
    },
    {
      name: "P250 | Franklin (Factory New)",
      marketHashName: "P250 | Franklin (Factory New)",
      imageUrl: null,
      amount: 1,
      assetCount: 1,
      marketable: true,
      steam: null,
      external: price(3),
    },
    {
      name: "Non-marketable item",
      marketHashName: "Non-marketable item",
      imageUrl: null,
      amount: 1,
      assetCount: 1,
      marketable: false,
      steam: price(100),
      external: price(200),
    },
  ];

  assert.deepEqual(calculateInventoryTotals(items), {
    assets: 4,
    marketableAssets: 3,
    unmarketableAssets: 1,
    steamPricedAssets: 2,
    externalPricedAssets: 3,
    steamValueUsd: 3,
    externalValueUsd: 7,
  });
});

test("Steam quote cooldown reuses recent snapshots and exposes remaining time", () => {
  const now = Date.parse("2026-10-02T12:00:00.000Z");
  const recent = new Date(now - 30_500);
  assert.deepEqual(getSteamRefreshCooldown(recent, 120, now), { reuse: true, remainingSeconds: 90 });
  assert.deepEqual(getSteamRefreshCooldown(new Date(now - 120_000), 120, now), { reuse: false, remainingSeconds: 0 });
  assert.deepEqual(getSteamRefreshCooldown(null, 120, now), { reuse: false, remainingSeconds: 0 });
});

test("Steam inventory parser принимает success числом и строкой, а не только boolean", () => {
  const numeric = parseSteamInventoryPage({
    success: 1,
    assets: [{ assetid: 1, classid: "2" }],
    descriptions: [],
    more_items: "0",
  });
  assert.equal(numeric.assets.length, 1);
  assert.equal(numeric.success, 1);

  const stringFlag = parseSteamInventoryPage({ success: "true" });
  assert.equal(stringFlag.assets.length, 0);
  assert.equal(stringFlag.descriptions.length, 0);

  // Отсутствие success — не отказ: страница данных остаётся валидной.
  const missing = parseSteamInventoryPage({ assets: [] });
  assert.equal(missing.assets.length, 0);
});

test("Steam inventory parser различает закрытый профиль и прочий отказ Steam", () => {
  assert.throws(
    () => parseSteamInventoryPage({ success: 0, Error: "This profile is private." }),
    PrivateSteamInventoryError,
  );

  assert.throws(
    () => parseSteamInventoryPage({ success: 0, error: "Inventory unavailable for this account." }),
    (error: unknown) =>
      error instanceof Error &&
      !(error instanceof ZodError) &&
      error.message.includes("Inventory unavailable for this account."),
  );
});

test("Steam inventory parser не отдаёт наружу сырой ZodError", () => {
  assert.throws(
    () => parseSteamInventoryPage({ assets: "not-an-array" }),
    (error: unknown) =>
      error instanceof Error && !(error instanceof ZodError) && error.message.includes("неожиданном формате"),
  );
});

test("Steam inventory page parser tolerates null optional fields and detects private profiles", () => {
  const page = parseSteamInventoryPage({
    success: true,
    assets: [{ assetid: "1", classid: "2", instanceid: null, amount: "1" }],
    descriptions: [{ classid: "2", instanceid: null, market_hash_name: null, marketable: null }],
    more_items: 0,
    total_inventory_count: null,
  });
  assert.equal(page.assets.length, 1);
  assert.equal(page.descriptions.length, 1);
  assert.equal(page.total_inventory_count, null);

  assert.throws(
    () => parseSteamInventoryPage({ success: false, Error: "This profile is private." }),
    PrivateSteamInventoryError,
  );
});
