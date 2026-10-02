import assert from "node:assert/strict";
import test from "node:test";
import { parseLisSkinsPriceList } from "@/lib/ingest/providers/lisskins";
import { parseSkinBaronPriceList } from "@/lib/ingest/providers/skinbaron";

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
