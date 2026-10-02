import assert from "node:assert/strict";
import test from "node:test";
import { getConfig, resetConfigCache } from "@/lib/config";

const ENV_KEYS = ["DATABASE_URL", "DATABASE_DRIVER", "SYNC_TOKEN", "API_RATE_LIMIT_PER_MINUTE"] as const;

function withEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>, run: () => void): void {
  const previous = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetConfigCache();
  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetConfigCache();
  }
}

test("драйвер выбирается по наличию DATABASE_URL", () => {
  withEnv({ DATABASE_URL: undefined, DATABASE_DRIVER: undefined }, () => {
    assert.equal(getConfig().driver, "pglite");
  });
  withEnv({ DATABASE_URL: "postgresql://user:pass@localhost:5432/db", DATABASE_DRIVER: undefined }, () => {
    assert.equal(getConfig().driver, "pg");
  });
  withEnv({ DATABASE_URL: "postgresql://user:pass@localhost:5432/db", DATABASE_DRIVER: "pglite" }, () => {
    assert.equal(getConfig().driver, "pglite");
  });
});

test("лимит частоты и токен синхронизации читаются из окружения", () => {
  withEnv({ API_RATE_LIMIT_PER_MINUTE: "30", SYNC_TOKEN: "0123456789abcdef" }, () => {
    const config = getConfig();
    assert.equal(config.API_RATE_LIMIT_PER_MINUTE, 30);
    assert.equal(config.SYNC_TOKEN, "0123456789abcdef");
  });
});

test("слишком короткий токен синхронизации отклоняется", () => {
  withEnv({ SYNC_TOKEN: "short" }, () => {
    assert.throws(() => getConfig(), /Некорректная конфигурация окружения/);
  });
});

test("анонимная синхронизация по умолчанию выключена", () => {
  withEnv({ DATABASE_URL: undefined, DATABASE_DRIVER: undefined }, () => {
    assert.equal(getConfig().ALLOW_ANONYMOUS_SYNC, false);
    assert.equal(getConfig().AUTO_BOOTSTRAP, true);
  });
});
