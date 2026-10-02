import assert from "node:assert/strict";
import test from "node:test";
import { RANGE_DAYS, historyRangeSchema, parseItemsQuery, toCatalogFilters } from "@/lib/api/validation";
import { ApiError } from "@/lib/api/http";

test("параметры каталога приводятся к безопасным значениям", () => {
  const query = parseItemsQuery(
    new URLSearchParams({ q: "  awp  ", sort: "price-asc", page: "2", limit: "50", requirePrice: "1" }),
  );
  assert.equal(query.q, "awp");
  assert.equal(query.sort, "price-asc");
  assert.equal(query.page, 2);
  assert.equal(query.limit, 50);
  assert.equal(query.requirePrice, true);

  const filters = toCatalogFilters(query);
  assert.equal(filters.query, "awp");
  assert.equal(filters.requirePrice, true);
  assert.equal(filters.marketId, undefined);
});

test("значения по умолчанию соответствуют публичному контракту", () => {
  const query = parseItemsQuery(new URLSearchParams());
  assert.equal(query.sort, "popularity");
  assert.equal(query.page, 1);
  assert.equal(query.limit, 30);
});

test("некорректные параметры отклоняются с 400", () => {
  assert.throws(() => parseItemsQuery(new URLSearchParams({ limit: "1000" })), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 400);
    return true;
  });
  assert.throws(() => parseItemsQuery(new URLSearchParams({ sort: "deals" })), ApiError);
  assert.throws(() => parseItemsQuery(new URLSearchParams({ minPrice: "10", maxPrice: "1" })), ApiError);
});

test("slugs ограничиваются и обрезаются по пробелам", () => {
  const slugs = Array.from({ length: 80 }, (_, index) => `item-${index}`).join(", ");
  const query = parseItemsQuery(new URLSearchParams({ slugs }));
  assert.equal(query.slugs?.length, 60);
  assert.equal(query.slugs?.[0], "item-0");
});

test("диапазоны истории переводятся в дни", () => {
  const parsed = historyRangeSchema.parse({});
  assert.equal(parsed.range, "365d");
  assert.equal(parsed.market, undefined);
  assert.equal(historyRangeSchema.parse({ range: "30d" }).range, "30d");
  assert.equal(RANGE_DAYS["7d"], 7);
  assert.equal(RANGE_DAYS["365d"], 365);
});
