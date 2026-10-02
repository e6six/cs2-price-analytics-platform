import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";

const BOOTSTRAP_DIR = path.join(process.cwd(), "data", "bootstrap");

type Manifest = {
  generatedAt: string;
  stats: { catalogItems: number; quoteItems: number; historyItems: number; historyDates: number; snapshotDate: string };
  sources: Array<{ id: string; repo: string; commit: string; license: string; usedFor: string }>;
  files: Record<string, { sha256: string; bytes: number; records: number }>;
};

const manifest = JSON.parse(readFileSync(path.join(BOOTSTRAP_DIR, "manifest.json"), "utf8")) as Manifest;

test("манифест набора содержит происхождение и лицензии источников", () => {
  assert.ok(manifest.generatedAt, "нет даты сборки набора");
  assert.ok(manifest.sources.length >= 2);
  for (const source of manifest.sources) {
    assert.match(source.repo, /^https:\/\/github\.com\//);
    assert.equal(source.commit.length, 40, `у ${source.id} не зафиксирован коммит`);
    assert.ok(source.license.length > 0);
    assert.ok(source.usedFor.length > 0);
  }
});

test("контрольные суммы артефактов совпадают с манифестом", () => {
  for (const [file, meta] of Object.entries(manifest.files)) {
    const content = readFileSync(path.join(BOOTSTRAP_DIR, file));
    const digest = createHash("sha256").update(content).digest("hex");
    assert.equal(digest, meta.sha256, `контрольная сумма ${file} не совпадает`);
    assert.equal(content.byteLength, meta.bytes);
  }
});

test("набор непустой и не содержит нулевых цен", () => {
  assert.ok(manifest.stats.catalogItems > 1_000);
  assert.ok(manifest.stats.quoteItems > 1_000);
  assert.ok(manifest.stats.historyItems > 1_000);
  assert.ok(manifest.stats.historyDates > 4);

  const quotes = JSON.parse(
    gunzipSync(readFileSync(path.join(BOOTSTRAP_DIR, "quotes.json.gz"))).toString("utf8"),
  ) as { capturedAt: string; quotes: Array<{ i: number; p: number }> };

  const prices = quotes.quotes.map((entry) => entry.p);
  assert.equal(prices.length, manifest.stats.quoteItems);
  assert.ok(prices.every((price) => Number.isFinite(price) && price > 0), "в наборе есть нулевые цены");
  assert.match(quotes.capturedAt, /^\d{4}-\d{2}-\d{2}/);
});
