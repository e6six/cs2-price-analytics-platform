import { markets } from "@/db/schema";
import type { Database } from "@/db";

export type SourceSeed = {
  id: string;
  name: string;
  shortName: string;
  region: string;
  website: string;
  integrationStatus: "live" | "dataset" | "credentials_required" | "planned" | "disabled";
  integrationType: "public_api" | "dataset" | "partner_api" | "manual";
  requiresCredentials: boolean;
  credentialEnvVar?: string;
  docsUrl?: string;
  dataLicense?: string;
  attribution?: string;
  rateLimitNotes?: string;
  priceSemantics?: string;
  normalizationNotes?: string;
  buyerFeePercent: string | null;
  sellerFeePercent: string | null;
  feeStatus: "reported" | "conflicting" | "unverified";
  feeSourceUrl?: string;
  feeCheckedAt?: Date;
  kycPolicy: string;
};

const CHECKED_AT = new Date("2026-10-02T00:00:00.000Z");

/**
 * Справочник площадок и датасетов.
 *
 * Комиссии взяты из публичных обзоров рынка на дату `feeCheckedAt`; там, где
 * источники противоречат друг другу, стоит `feeStatus: "conflicting"`, а сами
 * значения не показываются как факт. `verified` не выставляется вообще:
 * подтверждение должно приходить из документации площадки, а не из обзора, —
 * оператор может обновить запись, не меняя код.
 */
export const SOURCE_SEEDS: SourceSeed[] = [
  {
    id: "steam-community",
    name: "Steam Community Market",
    shortName: "Steam",
    region: "Глобально",
    website: "steamcommunity.com/market",
    integrationStatus: "live",
    integrationType: "public_api",
    requiresCredentials: false,
    docsUrl: "https://steamcommunity.com/market/",
    dataLicense: "Условия Steam (публичные цены, перепубликация ограничена)",
    rateLimitNotes: "Неофициальный эндпоинт priceoverview; адаптер держит ≤12 запросов/мин и уважает Retry-After",
    priceSemantics: "lowest_price — минимальная цена активного лота в USD; median_sale — медиана продаж за сутки",
    normalizationNotes:
      "Цена в Steam Wallet, а не реальные деньги: вывод средств невозможен. Комиссия удерживается с продавца, покупатель платит указанную цену.",
    buyerFeePercent: "0.00",
    sellerFeePercent: "15.00",
    feeStatus: "reported",
    feeSourceUrl: "https://cs2central.gg/blog/csfloat-review/",
    feeCheckedAt: CHECKED_AT,
    kycPolicy: "Не требуется (внутри Steam)",
  },
  {
    id: "skinport",
    name: "Skinport",
    shortName: "SP",
    region: "Европа · Global",
    website: "skinport.com",
    integrationStatus: "live",
    integrationType: "public_api",
    requiresCredentials: false,
    docsUrl: "https://docs.skinport.com/items",
    dataLicense: "Публичный API Skinport (условия площадки)",
    attribution: "Данные: Skinport (api.skinport.com)",
    rateLimitNotes: "8 запросов / 5 минут, ответ кэшируется 5 минут, обязателен Accept-Encoding: br",
    priceSemantics: "min_price — минимальная цена лота (цена покупателя), quantity — число лотов",
    normalizationNotes: "Покупатель платит указанную цену; комиссия удерживается с продавца при выплате.",
    buyerFeePercent: "0.00",
    sellerFeePercent: "12.00",
    feeStatus: "reported",
    feeSourceUrl: "https://csmarketcap.com/blog/tips-for-beginners/best-cs2-skin-markets-compared-2026-fees-safety-where-to-sell",
    feeCheckedAt: CHECKED_AT,
    kycPolicy: "KYC при выводе средств (в зависимости от суммы)",
  },
  {
    id: "csfloat",
    name: "CSFloat",
    shortName: "CF",
    region: "Global",
    website: "csfloat.com",
    integrationStatus: "live",
    integrationType: "public_api",
    requiresCredentials: false,
    docsUrl: "https://docs.csfloat.com/",
    dataLicense: "Публичный API CSFloat (условия площадки)",
    attribution: "Данные: CSFloat (csfloat.com/api)",
    rateLimitNotes: "Публичные методы: около 5 запросов/мин; адаптер держит интервал ≥12 секунд",
    priceSemantics: "price — цена лота в центах USD (приводится к долларам)",
    normalizationNotes:
      "Публичные обзоры расходятся в том, кто платит 2% комиссии (продавец или покупатель), поэтому комиссия помечена как противоречивая и не используется в расчётах по умолчанию.",
    buyerFeePercent: null,
    sellerFeePercent: null,
    feeStatus: "conflicting",
    feeSourceUrl: "https://floatpeak.com/trading/skinport-vs-csfloat/",
    feeCheckedAt: CHECKED_AT,
    kycPolicy: "Мягкий KYC (почта + Steam), уточняется площадкой",
  },
  {
    id: "buff163",
    name: "BUFF163",
    shortName: "BF",
    region: "Азия · Global",
    website: "buff.163.com",
    integrationStatus: "credentials_required",
    integrationType: "partner_api",
    requiresCredentials: true,
    credentialEnvVar: "BUFF_COOKIE",
    dataLicense: "Требуется согласие площадки; перепубликация цен ограничена",
    rateLimitNotes: "Доступ только с авторизованной сессией; адаптер держит ≤10 запросов/мин",
    priceSemantics: "sell_min_price — минимальная цена продажи в CNY",
    normalizationNotes: "Цены в CNY нормализуются в USD по курсу ЕЦБ (таблица cs2_fx_rates).",
    // Публичные обзоры противоречат друг другу (0% или 2.5% с покупателя),
    // поэтому числа не показываем: только статус «данные расходятся».
    buyerFeePercent: null,
    sellerFeePercent: null,
    feeStatus: "conflicting",
    feeSourceUrl: "https://www.steamanalyst.com/marketplace/buff163",
    feeCheckedAt: CHECKED_AT,
    kycPolicy: "Требуется аккаунт NetEase; выплаты только на Alipay/WeChat (Китай)",
  },
  {
    id: "dmarket",
    name: "DMarket",
    shortName: "DM",
    region: "Global",
    website: "dmarket.com",
    integrationStatus: "planned",
    integrationType: "public_api",
    requiresCredentials: false,
    credentialEnvVar: "DMARKET_API_KEY",
    dataLicense: "Публичный API DMarket (условия площадки)",
    rateLimitNotes: "Адаптер не подключён: требуется подтверждение условий использования API",
    priceSemantics: "Минимальная цена лота в USD; комиссия покупателя добавляется к цене предложения",
    normalizationNotes: "Цены в USD; при выводе средства конвертируются площадкой по её курсу",
    buyerFeePercent: "2.50",
    sellerFeePercent: "2.00",
    feeStatus: "reported",
    feeSourceUrl: "https://csmarketcap.com/blog/tips-for-beginners/best-cs2-skin-markets-compared-2026-fees-safety-where-to-sell",
    feeCheckedAt: CHECKED_AT,
    kycPolicy: "KYC при выводе средств",
  },
  {
    id: "skinbaron",
    name: "SkinBaron",
    shortName: "SB",
    region: "Европа",
    website: "skinbaron.de",
    integrationStatus: "credentials_required",
    integrationType: "partner_api",
    requiresCredentials: true,
    credentialEnvVar: "SKINBARON_API_KEY",
    docsUrl: "https://skinbaron.de/misc/apidoc/",
    dataLicense: "SkinBaron API Terms of Service; проверьте условия перепубликации",
    attribution: "Цены: официальный SkinBaron API (api.skinbaron.de)",
    rateLimitNotes: "GetExtendedPriceList — один bulk POST; публичный предел не указан, адаптер ограничивает запросы до 6/мин и требует API key",
    priceSemantics: "lowestPrice — минимальная цена активного предложения по marketHashName",
    normalizationNotes: "API schema не возвращает валюту; по умолчанию предполагается EUR (SKINBARON_PRICE_CURRENCY), проверьте валюту в аккаунте. EUR нормализуется по курсу ЕЦБ.",
    buyerFeePercent: "0.00",
    sellerFeePercent: "15.00",
    feeStatus: "reported",
    feeSourceUrl: "https://www.steamanalyst.com/guides/marketplaces/skinbaron",
    feeCheckedAt: CHECKED_AT,
    kycPolicy: "Требуется верификация (Германия, GDPR)",
  },
  {
    id: "tradeit",
    name: "Tradeit",
    shortName: "TI",
    region: "Global",
    website: "tradeit.gg",
    integrationStatus: "planned",
    integrationType: "partner_api",
    requiresCredentials: false,
    dataLicense: "Не проверена",
    rateLimitNotes: "Адаптер не подключён: торговая площадка без публичного прайс-листа",
    priceSemantics: "Минимальная цена лота в USD; в калькуляторе учитывается как цена покупателя",
    normalizationNotes: "Цены в USD; комиссии удерживаются с продавца",
    buyerFeePercent: null,
    sellerFeePercent: null,
    feeStatus: "unverified",
    kycPolicy: "Зависит от способа вывода",
  },
  {
    id: "lisskins",
    name: "Lis-Skins",
    shortName: "LS",
    region: "Европа · СНГ",
    website: "lis-skins.com",
    integrationStatus: "live",
    integrationType: "public_api",
    requiresCredentials: false,
    docsUrl: "https://lis-skins.stoplight.io/docs/lis-skins/l6th4ko9av64c-json-price-lists",
    dataLicense: "Условия LIS-SKINS; проверьте правила перепубликации",
    attribution: "Цены: LIS-SKINS public JSON price list (lis-skins.com)",
    rateLimitNotes: "Используется один grouped JSON экспорт на синхронизацию; для API лимит 200 запросов/мин, Search/экспорт может отставать на несколько минут",
    priceSemantics: "price — котируемая цена; unlocked_price — отдельное значение после/до разблокировки, не подменяет цену; count — число доступных предметов",
    normalizationNotes: "В компактном экспорте нет currency и гарантированного timestamp; валюта задаётся LISSKINS_PRICE_CURRENCY (по умолчанию USD), время запроса указано отдельно от возможной задержки фида.",
    buyerFeePercent: null,
    sellerFeePercent: null,
    feeStatus: "unverified",
    kycPolicy: "Не проверена",
  },
  {
    id: "skinsmonkey",
    name: "SkinsMonkey",
    shortName: "SM",
    region: "Global",
    website: "skinsmonkey.com",
    integrationStatus: "planned",
    integrationType: "partner_api",
    requiresCredentials: false,
    dataLicense: "Не проверена",
    rateLimitNotes: "Адаптер не подключён: площадка обмена, публичного API цен нет",
    priceSemantics: "Цена покупки в USD; выплата продавцу зависит от способа вывода",
    normalizationNotes: "Цены в USD; курс вывода фиксирует площадка",
    buyerFeePercent: null,
    sellerFeePercent: null,
    feeStatus: "unverified",
    kycPolicy: "Требуется верификация для вывода",
  },
  {
    id: "dataset:csgo-api",
    name: "CSGO-API (метаданные)",
    shortName: "API",
    region: "Global",
    website: "github.com/ByMykel/CSGO-API",
    integrationStatus: "dataset",
    integrationType: "dataset",
    requiresCredentials: false,
    docsUrl: "https://github.com/ByMykel/CSGO-API",
    dataLicense: "MIT",
    attribution: "Метаданные: ByMykel/CSGO-API (MIT). Названия и изображения предметов — Valve Corporation.",
    rateLimitNotes: "Периодический импорт JSON из репозитория",
    priceSemantics: "Цен нет: только описания, редкость, коллекции, изображения",
    buyerFeePercent: null,
    sellerFeePercent: null,
    feeStatus: "unverified",
    kycPolicy: "Не применимо",
  },
  {
    id: "dataset:steam-price-tracker",
    name: "Steam Price Tracker (датасет)",
    shortName: "TRK",
    region: "Global",
    website: "github.com/ByMykel/counter-strike-price-tracker",
    integrationStatus: "dataset",
    integrationType: "dataset",
    requiresCredentials: false,
    docsUrl: "https://github.com/ByMykel/counter-strike-price-tracker",
    dataLicense: "MIT (код и агрегат), данные — Valve/Steam",
    attribution: "Цены Steam: ByMykel/counter-strike-price-tracker (MIT)",
    rateLimitNotes: "Один запрос к GitHub API за снимок; лимит анонимного API — 60 запросов/час",
    priceSemantics: "lowest_price минимального лота Steam в USD на дату снимка",
    normalizationNotes: "Время снимка берётся из metadata.updated_at датасета, а не из времени запроса.",
    buyerFeePercent: null,
    sellerFeePercent: null,
    feeStatus: "unverified",
    kycPolicy: "Не применимо",
  },
];

export async function seedSources(db: Database): Promise<void> {
  const { sql } = await import("drizzle-orm");
  await db
    .insert(markets)
    .values(
      SOURCE_SEEDS.map((seed) => ({
        id: seed.id,
        name: seed.name,
        shortName: seed.shortName,
        region: seed.region,
        website: seed.website,
        integrationStatus: seed.integrationStatus,
        integrationType: seed.integrationType,
        requiresCredentials: seed.requiresCredentials,
        credentialEnvVar: seed.credentialEnvVar ?? null,
        docsUrl: seed.docsUrl ?? null,
        dataLicense: seed.dataLicense ?? null,
        attribution: seed.attribution ?? null,
        rateLimitNotes: seed.rateLimitNotes ?? null,
        priceSemantics: seed.priceSemantics ?? null,
        normalizationNotes: seed.normalizationNotes ?? null,
        buyerFeePercent: seed.buyerFeePercent,
        sellerFeePercent: seed.sellerFeePercent,
        feeStatus: seed.feeStatus,
        feeSourceUrl: seed.feeSourceUrl ?? null,
        feeCheckedAt: seed.feeCheckedAt ?? null,
        kycPolicy: seed.kycPolicy,
        updatedAt: new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: markets.id,
      set: {
        name: sql`excluded.name`,
        shortName: sql`excluded.short_name`,
        region: sql`excluded.region`,
        website: sql`excluded.website`,
        integrationStatus: sql`excluded.integration_status`,
        integrationType: sql`excluded.integration_type`,
        requiresCredentials: sql`excluded.requires_credentials`,
        credentialEnvVar: sql`excluded.credential_env_var`,
        docsUrl: sql`excluded.docs_url`,
        dataLicense: sql`excluded.data_license`,
        attribution: sql`excluded.attribution`,
        rateLimitNotes: sql`excluded.rate_limit_notes`,
        priceSemantics: sql`excluded.price_semantics`,
        normalizationNotes: sql`excluded.normalization_notes`,
        buyerFeePercent: sql`excluded.buyer_fee_percent`,
        sellerFeePercent: sql`excluded.seller_fee_percent`,
        feeStatus: sql`excluded.fee_status`,
        feeSourceUrl: sql`excluded.fee_source_url`,
        feeCheckedAt: sql`excluded.fee_checked_at`,
        kycPolicy: sql`excluded.kyc_policy`,
        updatedAt: sql`now()`,
      },
    });
}
