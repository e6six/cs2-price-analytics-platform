/**
 * Загрузка исходных данных (raw sources) для сборки проверенного набора.
 *
 * Источники — открытые репозитории GitHub с лицензией MIT:
 *  - ByMykel/CSGO-API — метаданные предметов CS2;
 *  - ByMykel/counter-strike-price-tracker — агрегат минимальных цен Steam
 *    (вместе с историей коммитов, где хранятся прошлые снимки).
 *
 * Скрипт не ходит на маркетплейсы: он только клонирует/обновляет репозитории.
 * Данные складываются в кэш-каталог и не коммитятся.
 *
 * Запуск: npm run data:fetch
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const SOURCES_DIR = process.env.SOURCES_DIR ?? path.join(process.cwd(), ".cache", "sources");

const CSGO_API_REPO = "https://github.com/ByMykel/CSGO-API.git";
const TRACKER_REPO = "https://github.com/ByMykel/counter-strike-price-tracker.git";

function git(args: string[], cwd?: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 512,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function cloneOrUpdate(url: string, target: string, options: { sparse?: string[]; depth?: number } = {}): void {
  const exists = existsSync(path.join(target, ".git"));
  if (!exists) {
    rmSync(target, { recursive: true, force: true });
    mkdirSync(path.dirname(target), { recursive: true });
    const args = ["clone", "--filter=blob:none"];
    if (options.depth) args.push("--depth", String(options.depth));
    if (options.sparse) args.push("--sparse");
    args.push(url, target);
    console.log(`[data:fetch] клонирование ${url}`);
    git(args);
  } else {
    console.log(`[data:fetch] обновление ${target}`);
    try {
      git(["fetch", "--all", "--prune"], target);
      git(["reset", "--hard", "origin/HEAD"], target);
    } catch (error) {
      console.warn(`[data:fetch] не удалось обновить ${target}`, error instanceof Error ? error.message : error);
    }
  }

  if (options.sparse) {
    git(["sparse-checkout", "set", ...options.sparse], target);
  }
}

function headCommit(target: string): string {
  try {
    return git(["rev-parse", "HEAD"], target).trim();
  } catch {
    return "unknown";
  }
}

function main(): void {
  mkdirSync(SOURCES_DIR, { recursive: true });

  const csgoApiDir = path.join(SOURCES_DIR, "csgo-api");
  cloneOrUpdate(CSGO_API_REPO, csgoApiDir, { sparse: ["public/api/en"] });

  const trackerDir = path.join(SOURCES_DIR, "counter-strike-price-tracker");
  cloneOrUpdate(TRACKER_REPO, trackerDir);

  const meta = {
    fetchedAt: new Date().toISOString(),
    sourcesDir: SOURCES_DIR,
    csgoApi: { repo: "https://github.com/ByMykel/CSGO-API", commit: headCommit(csgoApiDir), license: "MIT" },
    priceTracker: {
      repo: "https://github.com/ByMykel/counter-strike-price-tracker",
      commit: headCommit(trackerDir),
      license: "MIT",
    },
  };

  console.log(JSON.stringify(meta, null, 2));
  console.log("[data:fetch] готово. Далее: npm run data:bootstrap");
}

main();
