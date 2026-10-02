import { z } from "zod";
import { badRequest } from "@/lib/api/http";
import type { CatalogFilters } from "@/lib/analytics/queries";

const SORT_VALUES = [
  "popularity",
  "price-asc",
  "price-desc",
  "change-asc",
  "change-desc",
  "name",
  "markets-desc",
  "updated-desc",
] as const;

const booleanParam = z
  .union([z.literal("1"), z.literal("0"), z.literal("true"), z.literal("false"), z.literal("")])
  .optional()
  .transform((value) => value === "1" || value === "true");

const optionalTrimmed = (maxLength = 120) =>
  z
    .string()
    .max(maxLength, `Значение длиннее ${maxLength} символов`)
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed && trimmed.length > 0 ? trimmed : undefined;
    });

export const itemsQuerySchema = z.object({
  q: optionalTrimmed(120),
  category: optionalTrimmed(80),
  kind: optionalTrimmed(40),
  weapon: optionalTrimmed(80),
  rarity: optionalTrimmed(80),
  collection: optionalTrimmed(120),
  wear: optionalTrimmed(80),
  market: optionalTrimmed(60),
  stattrak: booleanParam,
  souvenir: booleanParam,
  minPrice: z.coerce.number().min(0).max(1_000_000).optional(),
  maxPrice: z.coerce.number().min(0).max(1_000_000).optional(),
  sort: z.enum(SORT_VALUES).default("popularity"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  requirePrice: booleanParam,
  /** Список slug через запятую — используется списком наблюдения. */
  slugs: z
    .string()
    .max(2_000)
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0 && entry.length <= 120)
            .slice(0, 60)
        : undefined,
    ),
});

export type ItemsQuery = z.infer<typeof itemsQuerySchema>;

export function parseItemsQuery(params: URLSearchParams): ItemsQuery {
  const raw: Record<string, string> = {};
  for (const key of Object.keys(itemsQuerySchema.shape)) {
    const value = params.get(key);
    if (value !== null) raw[key] = value;
  }
  const parsed = itemsQuerySchema.safeParse(raw);
  if (!parsed.success) {
    throw badRequest("Некорректные параметры запроса", parsed.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })));
  }
  if (
    parsed.data.minPrice !== undefined &&
    parsed.data.maxPrice !== undefined &&
    parsed.data.minPrice > parsed.data.maxPrice
  ) {
    throw badRequest("minPrice не может быть больше maxPrice");
  }
  return parsed.data;
}

export function toCatalogFilters(query: ItemsQuery): CatalogFilters {
  return {
    query: query.q,
    category: query.category,
    kind: query.kind,
    weapon: query.weapon,
    rarity: query.rarity,
    collection: query.collection,
    wear: query.wear,
    marketId: query.market,
    stattrak: query.stattrak,
    souvenir: query.souvenir,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    requirePrice: query.requirePrice,
    slugs: query.slugs,
    sort: query.sort,
    page: query.page,
    limit: query.limit,
  };
}

export const historyRangeSchema = z.object({
  range: z.enum(["7d", "30d", "90d", "365d"]).default("365d"),
  market: optionalTrimmed(60),
});

export const RANGE_DAYS: Record<"7d" | "30d" | "90d" | "365d", number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "365d": 365,
};

export const syncRequestSchema = z.object({
  sources: z.array(z.string().min(1).max(60)).max(10).optional(),
  limit: z.number().int().min(1).max(50_000).optional(),
  aggregateHistory: z.boolean().optional(),
});
