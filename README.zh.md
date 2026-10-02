<p align="center">
  <img src="docs/assets/banner.png" alt="CS2 Index — Counter-Strike 2 物品独立价格分析平台" width="100%">
</p>

<div align="center">

# CS2 Index

**Counter-Strike 2 物品独立价格分析平台。** 收录 34 029 个物品，跨平台报价对比、周度价格历史、平台目录与到手价计算器 —— 基于公开数据快照，每一个数字都有出处。

[![Next.js 16](https://img.shields.io/badge/Next.js-16.2-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![TypeScript 5.9](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.45-C5F74F?logo=drizzle&logoColor=black)](https://orm.drizzle.team)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![内置 PGlite](https://img.shields.io/badge/内置-PGlite-4B5563)](https://pglite.dev)
[![测试](https://img.shields.io/badge/测试-16_项通过-3FB950)](tests)
[![数据许可 MIT](https://img.shields.io/badge/数据-MIT-2EA44F)](data/bootstrap/manifest.json)

[English](README.md) · [Русский](README.ru.md) · **中文** · [Español](README.es.md)

</div>

---

## 这是什么 —— 以及不是什么

CS2 Index 只专注回答一个问题：*这件物品现在值多少、价格如何变化、这个数字来自哪里？*

- **真实快照数据，不是演示行情。** 仓库内置可复现的公开数据集（`data/bootstrap`，3.1 MB，校验和记录在清单中），应用首次启动时自动导入。
- **不涉及交易、不谈资金托管、不需要账号。** 本服务只展示数据，与 Valve Corporation 无任何关联。
- **绝不编造数值。** 没有报价时界面显示 `—`，而不是 `0` 或估算值。

## 界面截图

| 市场总览（深色主题） | 市场总览（浅色主题） |
| --- | --- |
| ![市场总览](docs/assets/screens/overview.png) | ![市场总览，浅色主题](docs/assets/screens/overview-light.png) |

| 带筛选的物品目录 | 物品详情 |
| --- | --- |
| ![目录](docs/assets/screens/catalog.png) | ![物品详情](docs/assets/screens/item.png) |

| 交易平台目录 | 数据来源与溯源 |
| --- | --- |
| ![平台](docs/assets/screens/markets.png) | ![数据来源](docs/assets/screens/data.png) |

## 数据概况

| 指标 | 数值 |
| --- | --- |
| 目录物品 | 34 029 件 —— 皮肤、印花、武器箱、特工、涂鸦、挂件、音乐盒、布章、收藏品、钥匙 |
| 报价 | 快照日期当天 27 717 条 |
| 历史数据 | 25 850 件物品 × 25 个周度日期（2026-02-08 … 2026-08-08），共 631 840 个数据点 |
| 价格语义 | Steam 社区市场最低在售价，USD |
| 数据来源 | [ByMykel/CSGO-API](https://github.com/ByMykel/CSGO-API)（MIT）—— 元数据；[ByMykel/counter-strike-price-tracker](https://github.com/ByMykel/counter-strike-price-tracker)（MIT）—— Steam 周度价格快照 |

代码真正落实的原则：

- **每条价格都保留出处** —— 来源、价格类型、货币、采集时间与原始链接（`cs2_price_quotes.source_url`、`cs2_source_health` 表、数据集清单）。
- **数据缺失保持显式** —— 没有报价就没有行；界面显示 `—`，而不是零或推测值。
- **未经核实的手续费不会被当作事实** —— 平台手续费带有 `reported` / `conflicting` 状态、来源链接和核实日期；状态为 `conflicting` 时完全不显示百分比。
- **异常序列被标记，而不是被「修」成假象** —— 相邻周度观测相差超过 5 倍时，不计算涨跌幅（`change_7d = null`，标记 `changeSuppressed`）。
- **变化经过平滑，比较日期如实给出** —— 当前值与 7/30/90 天对照点取三次观测的中位数，对照日期单独返回（`change7dFrom`），因为数据集是周度的，「正好一周前」可能并不存在。

快照不是实时数据流。数据新鲜度在界面（数据年龄徽标）和 `GET /api/health` 中可见，更新数据通过同步任务写入（`npm run sync`、`POST /api/sync`）。

## 架构

<img src="docs/assets/architecture.png" alt="数据流：公开数据源 → 采集 → 存储 → API 与界面" width="100%">

各平台适配器共用同一套契约（`src/lib/ingest/providers`），采集器为每个来源维护熔断器与运行日志；物品统计（`refreshItemStats`）在导入和每次同步后一次性重建，因此目录与总览不会对整段历史执行窗口函数。

## 功能

- **目录** —— 按名称搜索，支持分类、武器、稀有度、收藏系列、磨损、StatTrak™、纪念品、价格区间、仅有价格等筛选，8 种排序与分页。
- **物品详情** —— 最低/平均/最高价、跨平台价差、7/30/90 天变化与对照日期、历史走势图、带出处和时效的报价表、未返回报价的平台列表，以及仅针对该物品的 Steam `lowest_price` 拉取按钮（冷却时间 `STEAM_PRICE_REFRESH_COOLDOWN_SECONDS`，默认 120 秒）。
- **市场总览** —— 数据新鲜度、指数（物品篮子价格相对基准日的比值中位数）、市场宽度（上涨/下跌/持平）、涨跌榜、最具流动性物品。
- **库存估值** —— 通过 SteamID64 或 `/profiles/…` 链接，用 Steam 市场与外部平台的价格为**公开** CS2 库存估值：支持筛选、按行金额排序，以及「Steam／外部」口径切换。ID 只保存在该浏览器的 `localStorage`，物品列表只在服务器内存中停留不超过 60 秒，不写入数据库。
- **平台目录** —— 集成状态、带核实状态的手续费、KYC、速率限制、熔断器状态、报价数量。
- **数据来源页** —— 来源与运行记录表、bootstrap 数据集构成、许可证与署名、免责声明。
- **到手价计算器** —— 依据真实报价与显式选择的手续费计算。
- **界面** —— 浅色/深色主题（加载时无闪烁）、本地托管 Inter 字体（拉丁 + 西里尔）、`/` 聚焦搜索框、响应式布局、俄语本地化、`localStorage` 收藏夹。
- **API** —— 统一错误信封、限流、缓存与 Prometheus 指标。

## 快速开始

```bash
git clone https://github.com/e6six/cs2-price-analytics-platform.git
cd cs2-price-analytics-platform
npm install
npm run dev          # http://localhost:3000
```

未设置 `DATABASE_URL` 时，应用会在 `.cache/pglite` 中启动内置 PostgreSQL（PGlite），执行迁移并导入 `data/bootstrap` 数据集。首次启动约需一到两分钟，之后直接复用磁盘上的数据库。

生产模式：

```bash
export DATABASE_URL=postgresql://cs2:cs2@127.0.0.1:5432/cs2_index
npm run db:migrate && npm run db:seed -- --refresh
npm run build && npm run start
```

完整环境变量见 [`.env.example`](.env.example)。密钥（平台令牌、`SYNC_TOKEN`）只保存在环境变量中。

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` / `build` / `start` | 开发、构建、生产服务 |
| `npm run lint` / `typecheck` / `test` / `verify` | ESLint、TypeScript、测试（node:test）及全部检查 |
| `npm run db:migrate` | 应用 Drizzle 迁移 |
| `npm run db:seed` | 空库导入数据集（幂等） |
| `npm run db:seed -- --refresh` | 强制重新导入 `data/bootstrap` |
| `npm run db:seed -- --stats` | 重建物品统计指标 |
| `npm run data:fetch` | 克隆/更新公开数据集到 `.cache/sources` |
| `npm run data:bootstrap` | 重建 `data/bootstrap/*` 与校验和清单 |
| `npm run sync -- --source=steam-community --limit=50` | 对少量物品做一次 Steam `priceoverview` 拉取 |
| `npm run sync -- --source=steam-search` | 遍历 Steam 搜索（实时价格）；再次运行从保存的游标继续，`--limit=N` 限制本次页数 |
| `npm run sync:watch -- --interval=5` | 独立 worker：每 5 分钟循环刷新批量来源（Skinport、CSFloat、LIS-SKINS、SkinBaron） |
| `npm run db:studio` | Drizzle Studio |

## API

所有响应均为 JSON；错误格式为 `{ "error": { "code", "message", "details" }, "requestId" }`，并带有 `x-request-id`、`cache-control` 响应头。

| 方法与路径 | 说明 |
| --- | --- |
| `GET /api/health` | 数据库与数据状态：`200` 就绪、`503` 空/不可用、快照新鲜度 |
| `GET /api/items` | 目录：`q`、`category`、`kind`、`weapon`、`rarity`、`collection`、`wear`、`stattrak`、`souvenir`、`minPrice`、`maxPrice`、`requirePrice`、`slugs`（最多 60）、`sort`（8 种）、`page`、`limit`（≤100） |
| `GET /api/items/{id\|slug}?range=7d\|30d\|90d\|365d` | 物品详情：报价、历史、统计 |
| `POST /api/items/{id}/refresh?range=…` | 为单个物品拉取当前 Steam `lowest_price`；受共享限流器与冷却时间约束 |
| `POST /api/inventory/valuation` | 为公开 CS2 库存估值。JSON 请求体：`{ "steamId64": "7656119…" }`；返回逐件价格与 Steam、外部平台金额 |
| `GET /api/items/{id}/history?range=…&market=…` | 时间序列（窗口从该物品最后观测日期向前计算） |
| `GET /api/markets` | 平台与手续费目录 |
| `GET /api/analytics/summary` | 市场汇总：新鲜度、覆盖率、指数、宽度、榜单 |
| `GET /api/facets` | 各筛选值及物品数量 |
| `GET /api/sources` | 数据源状态与最近运行 |
| `GET /api/metrics` | Prometheus 指标（`cs2_db_up`、`cs2_items_total`、`cs2_data_age_hours`、`cs2_market_index` 等） |
| `GET /api/sync` / `POST /api/sync` | 同步状态 / 触发（`Authorization: Bearer $SYNC_TOKEN`） |

## 数据模型

`src/db/schema.ts`：

- `cs2_markets` —— 平台与数据集目录：集成状态、是否需要密钥、价格语义、带核实状态的手续费、KYC、限制。
- `cs2_items` —— 规范化物品（`market_hash_name`、元数据、图片、`popularity` = 有价格的日期占比）。
- `cs2_price_quotes` —— 报价快照：`price_kind`、价格、货币、`price_usd`、`captured_at`、`source_url`、`is_live`。
- `cs2_price_history_daily` —— 日/周序列（`item + market + date + price_kind` 唯一）。
- `cs2_item_stats` —— 物化指标：最低/平均价、最优平台、平滑后的 7/30/90 天变化与对照日期、历史覆盖率、`series_noisy` 标记。
- `cs2_ingest_runs`、`cs2_source_health` —— 运行日志与来源状态（熔断器、错误、计数器）。
- `cs2_fx_rates` —— 用于货币归一化的 ECB 汇率（回退值为标记 `static` 的静态汇率）。

## 数据来源与合规

- **Steam 社区市场** —— 公开的 `market/priceoverview` 接口；适配器限制 ≤12 次请求/分钟，遵循 `Retry-After`，使用退避与熔断器。完整历史（`market/pricehistory`）需要账号持有者的 cookie（`STEAM_MARKET_COOKIE`，由运维配置）。
- **Skinport** —— 公开 `/v1/items` 接口（USD、`tradable`），缓存 5 分钟，建议 5 分钟内不超过 8 次请求。
- **CSFloat** —— 公开 `listings/price-list`；带密钥时限额更高。
- **BUFF163** —— 仅限授权会话（`BUFF_COOKIE`），CNY，≤10 次请求/分钟。
- **公开数据集**（GitHub，MIT）—— 通过 Contents API 批量更新价格与元数据。
- 计划中的平台（DMarket、SkinBaron、Tradeit、LIS-SKINS、SkinsMonkey）仅存在于目录中：在确认 API 条款前不接入适配器。

项目规则：不绕过 CAPTCHA、Cloudflare、授权与反机器人保护；不使用代理规避限流；不把未经核实的手续费、结算与 KYC 当作事实；不用估算替代数据缺失；未经平台条款许可不二次发布其数据。

## 运维

- **新鲜度**：`GET /api/health` 与 `cs2_data_age_hours` 指标（`isStale` —— 超过 14 天）。
- **同步**：`npm run sync` 或带 `SYNC_TOKEN` 的 `POST /api/sync`；定期更新请使用 cron/worker（`AUTO_BOOTSTRAP=true` 仅首次启动需要）。
- **可观测性**：结构化 JSON 日志、`GET /api/metrics`（Prometheus）。
- **限流**：目前为进程内实现 —— 多副本部署时需要 Redis 或前置网关限流。
- **备份**：PGlite 只需归档 `.cache/pglite` 目录；PostgreSQL 使用常规备份流程。
- **保留策略**：`QUOTE_RETENTION_DAYS` 限制旧报价快照的保存时间。

## 限制

- 内置数据集为周度快照；「7 天变化」表示最接近的可用观测，日期始终由 API 返回。
- 公开数据集中的纪念品更容易出现离群值 —— 这类序列会被标记为不稳定，而不是凭手工「修正」。
- 没有交易、资金托管、Steam 登录与通知：服务只负责展示数据。与 Valve Corporation 无关联。
- 未接入 Valve 本地化：物品名称保留规范的英文形式。
- 当前数据集中的 `steam-community` 标记为 `isLive: false` —— 它是数据集快照，而不是渲染时对 Steam 的实时请求。
- 物品图片来自 Valve CDN，不随仓库分发；CDN 不可用时，卡片会显示按稀有度着色的字母标识。

## 许可证与署名

项目代码在本仓库范围内分发。数据：

- [ByMykel/CSGO-API](https://github.com/ByMykel/CSGO-API) —— MIT，Copyright (c) 2023 ByMykel。
- [ByMykel/counter-strike-price-tracker](https://github.com/ByMykel/counter-strike-price-tracker) —— MIT，Copyright (c) 2026 ByMykel。
- Inter 字体 —— SIL Open Font License 1.1（`src/fonts/inter/LICENSE.txt`）。

用于构建数据集的提交记录连同产物校验和一同固定在 `data/bootstrap/manifest.json`。物品名称与图片归 Valve Corporation 所有，本项目不主张任何相关权利。

<div align="center">

[English](README.md) · [Русский](README.ru.md) · **中文** · [Español](README.es.md)

</div>
