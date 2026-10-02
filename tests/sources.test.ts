import assert from "node:assert/strict";
import test from "node:test";
import { SOURCE_SEEDS } from "@/lib/ingest/sources";

test("справочник источников не содержит дублей", () => {
  const ids = SOURCE_SEEDS.map((source) => source.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("комиссии не выдаются за проверенный факт", () => {
  for (const source of SOURCE_SEEDS) {
    assert.ok(["reported", "conflicting", "unverified"].includes(source.feeStatus), source.id);
    if (source.feeStatus === "conflicting") {
      // Противоречивые данные нельзя показывать как число.
      assert.equal(source.buyerFeePercent, null, `${source.id}: buyer fee при conflicting`);
      assert.equal(source.sellerFeePercent, null, `${source.id}: seller fee при conflicting`);
    }
    if (source.feeStatus === "unverified") {
      assert.equal(source.feeSourceUrl, undefined);
    } else {
      assert.ok(source.feeSourceUrl?.startsWith("http"), `${source.id}: нет ссылки на источник комиссии`);
      assert.ok(source.feeCheckedAt instanceof Date, `${source.id}: нет даты проверки`);
    }
  }
});

test("источники с обязательными учётными данными объявляют переменную окружения", () => {
  for (const source of SOURCE_SEEDS) {
    if (source.requiresCredentials) {
      assert.ok(source.credentialEnvVar, `${source.id}: не указана переменная с ключом`);
    }
  }
});

test("у площадок заполнены семантика цены и политика KYC", () => {
  for (const source of SOURCE_SEEDS) {
    assert.ok(source.priceSemantics && source.priceSemantics.length > 10, `${source.id}: пустая семантика цены`);
    assert.ok(source.kycPolicy.length > 0, `${source.id}: пустая политика KYC`);
    assert.ok((source.rateLimitNotes ?? "").length > 0, `${source.id}: не описаны ограничения запросов`);
  }
});
