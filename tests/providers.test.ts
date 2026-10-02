import assert from "node:assert/strict";
import test from "node:test";
import { parseLisSkinsPriceList } from "@/lib/ingest/providers/lisskins";
import { parseSkinBaronPriceList } from "@/lib/ingest/providers/skinbaron";
import { parseSteamPriceOverview, steamSuccessIsFalse } from "@/lib/ingest/providers/steam-community";
import {
  parseSteamSearchPage,
  readCursor,
  SEARCH_PAGE_SIZE,
  steamSearchProvider,
} from "@/lib/ingest/providers/steam-search";
import { getProvider, providers } from "@/lib/ingest/providers";

test("LIS-SKINS uses the quoted price, availability count and published feed time", () => {
  const fetchedAt = new Date("2026-10-02T12:00:00.000Z");
  const quotes = parseLisSkinsPriceList(
    {
      status: "success",
      last_update: 1_760_000_000,
      items: [
        {
          name: "AK-47 | Redline (Field-Tested)",
          price: 15.5,
          unlocked_price: 16.25,
          count: 7,
          url: "https://app.lis-skins.com/market/csgo/example/",
        },
        { name: "Sticker | Test", price: 0, count: 0 },
      ],
    },
    { currency: "USD", fetchedAt },
  );

  assert.equal(quotes.length, 1);
  assert.equal(quotes[0].marketHashName, "AK-47 | Redline (Field-Tested)");
  assert.equal(quotes[0].marketId, "lisskins");
  assert.equal(quotes[0].priceKind, "lowest_ask");
  assert.equal(quotes[0].price, 15.5);
  assert.equal(quotes[0].volume, 7);
  assert.equal(quotes[0].currency, "USD");
  assert.equal(quotes[0].capturedAt.toISOString(), new Date(1_760_000_000 * 1000).toISOString());
});

test("LIS-SKINS does not treat unlock price as the current quote when price is missing", () => {
  const quotes = parseLisSkinsPriceList([{ name: "P250 | Franklin (Factory New)", unlocked_price: "1.07" }]);
  assert.equal(quotes.length, 0);
});

test("Steam success-флаг считается отказом только для явных false/0/'0'/'false'", () => {
  assert.equal(steamSuccessIsFalse(1), false);
  assert.equal(steamSuccessIsFalse("1"), false);
  assert.equal(steamSuccessIsFalse(true), false);
  assert.equal(steamSuccessIsFalse(undefined), false);
  assert.equal(steamSuccessIsFalse(null), false);

  assert.equal(steamSuccessIsFalse(0), true);
  assert.equal(steamSuccessIsFalse("0"), true);
  assert.equal(steamSuccessIsFalse(false), true);
  assert.equal(steamSuccessIsFalse("false"), true);
});

test("Steam priceoverview parser принимает success числом и пустой ответ без исключения", () => {
  const parsed = parseSteamPriceOverview({ success: 1, lowest_price: "$1.23" });
  assert.equal(parsed.success, 1);
  assert.equal(parsed.lowest_price, "$1.23");

  const empty = parseSteamPriceOverview({});
  assert.equal(empty.success, undefined);
  assert.equal(empty.lowest_price, undefined);
});

test("steam-search переводит центы в доллары и берёт объём из активных лотов", () => {
  const page = parseSteamSearchPage({
    total_count: 34_001,
    results: [
      { hash_name: "AK-47 | Redline (Field-Tested)", sell_price: 1234, sell_price_text: "$12.34", sell_listings: 45 },
      { hash_name: "AWP | Asiimov (Field-Tested)", sell_price: 0, sell_price_text: "$123.45", sell_listings: 0 },
      { hash_name: " P250 | Franklin (Factory New) ", sell_price_text: "$1.07", sell_listings: "12" },
    ],
  });

  assert.equal(page.totalCount, 34_001);
  assert.deepEqual(page.rows, [
    { marketHashName: "AK-47 | Redline (Field-Tested)", price: 12.34, volume: 45 },
    { marketHashName: "AWP | Asiimov (Field-Tested)", price: 123.45, volume: 0 },
    { marketHashName: "P250 | Franklin (Factory New)", price: 1.07, volume: null },
  ]);
});

test("steam-search не превращает HTML-заглушку и битые позиции в котировки", () => {
  assert.deepEqual(parseSteamSearchPage("<!doctype html><html><body>Just a moment…</body></html>"), {
    totalCount: null,
    rows: [],
  });
  assert.deepEqual(parseSteamSearchPage(null), { totalCount: null, rows: [] });
  assert.deepEqual(parseSteamSearchPage({ total_count: "34000", results: "nope" }), {
    totalCount: null,
    rows: [],
  });

  const page = parseSteamSearchPage({
    total_count: 5,
    results: [
      { hash_name: "   ", sell_price: 100 },
      { hash_name: "No price", sell_price: 0 },
      { hash_name: "Broken price", sell_price: -10, sell_price_text: "$0.00" },
      null,
      { hash_name: "Valid", sell_price: 250 },
    ],
  });
  assert.equal(page.totalCount, 5);
  assert.deepEqual(page.rows, [{ marketHashName: "Valid", price: 2.5, volume: null }]);
});

test("readCursor переживает мусор в журнале прогонов и читает валидное состояние", () => {
  assert.deepEqual(readCursor(null), { nextStart: 0, totalCount: null, completedPasses: 0 });
  assert.deepEqual(readCursor(undefined), { nextStart: 0, totalCount: null, completedPasses: 0 });
  assert.deepEqual(readCursor({ nextStart: -5, totalCount: "abc", completedPasses: -1 }), {
    nextStart: 0,
    totalCount: null,
    completedPasses: 0,
  });
  assert.deepEqual(readCursor({ nextStart: "220", totalCount: 341, completedPasses: "2" }), {
    nextStart: 220,
    totalCount: 341,
    completedPasses: 2,
  });
  assert.deepEqual(readCursor({ nextStart: 12.9 }), { nextStart: 12, totalCount: null, completedPasses: 0 });
});

test("steam-search зарегистрирован как bulk-источник без ключа и без списка имён", () => {
  assert.equal(steamSearchProvider.id, "steam-search");
  assert.equal(steamSearchProvider.marketId, "steam-community");
  assert.equal(steamSearchProvider.mode, "bulk");
  assert.equal(steamSearchProvider.requiresCredentials, false);
  assert.equal(steamSearchProvider.supportsNameFilter, false);
  assert.equal(SEARCH_PAGE_SIZE, 10);

  assert.equal(getProvider("steam-search"), steamSearchProvider);
  const datasetIndex = providers.findIndex((provider) => provider.id === "steam-dataset");
  const searchIndex = providers.findIndex((provider) => provider.id === "steam-search");
  assert.ok(searchIndex > datasetIndex, "steam-search должен идти после bulk-датасета");
});

test("SkinBaron parses the official extended price-list fields without inventing quantity", () => {
  const capturedAt = new Date("2026-10-02T12:00:00.000Z");
  const quotes = parseSkinBaronPriceList(
    [
      { marketHashName: "AWP | Asiimov (Field-Tested)", lowestPrice: 42.5, minWear: 0.15, maxWear: 0.38 },
      { marketHashName: "No listing", lowestPrice: null },
    ],
    { currency: "EUR", capturedAt },
  );

  assert.equal(quotes.length, 1);
  assert.equal(quotes[0].marketHashName, "AWP | Asiimov (Field-Tested)");
  assert.equal(quotes[0].price, 42.5);
  assert.equal(quotes[0].currency, "EUR");
  assert.equal(quotes[0].volume, undefined);
  assert.equal(quotes[0].capturedAt, capturedAt);
  assert.match(quotes[0].note ?? "", /SKINBARON_PRICE_CURRENCY/);
});
