/** Форматирование и локализация подписей. Данные хранятся в канонической англоязычной форме Valve. */

export function formatUsd(value: number | null | undefined, options: { compact?: boolean } = {}): string {
  if (value === null || value === undefined) return "—";
  if (options.compact && value >= 10_000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toLocaleString("ru-RU", {
    minimumFractionDigits: value < 100 ? 2 : 0,
    maximumFractionDigits: value < 100 ? 2 : 0,
  })}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("ru-RU");
}

export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatAge(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return "нет данных";
  if (hours < 1) return `${Math.round(hours * 60)} мин назад`;
  if (hours < 48) return `${Math.round(hours)} ч назад`;
  const days = Math.round(hours / 24);
  if (days < 60) return `${days} дн назад`;
  return `${Math.round(days / 30)} мес назад`;
}

const RARITY_LABELS: Record<string, string> = {
  "Consumer Grade": "Ширпотреб",
  "Industrial Grade": "Промышленное",
  "Mil-Spec Grade": "Армейское качество",
  Restricted: "Запрещённое",
  Classified: "Засекреченное",
  Covert: "Тайное",
  Contraband: "Контрабандное",
  Extraordinary: "Исключительное",
  "Base Grade": "Базовое",
  "High Grade": "Высокое",
  Remarkable: "Примечательное",
  Exotic: "Экзотическое",
  "Exceedingly Rare": "Крайне редкое",
  Distinguished: "Выдающееся",
  Exceptional: "Исключительное",
  Superior: "Превосходное",
  Master: "Мастерское",
};

export function rarityLabel(value: string | null | undefined): string {
  if (!value) return "Без редкости";
  return RARITY_LABELS[value] ?? value;
}

const CATEGORY_LABELS: Record<string, string> = {
  Rifles: "Винтовки",
  Pistols: "Пистолеты",
  Knives: "Ножи",
  Gloves: "Перчатки",
  SMGs: "Пистолеты-пулемёты",
  Heavy: "Тяжёлое оружие",
  Agents: "Агенты",
  Stickers: "Наклейки",
  Graffiti: "Граффити",
  Cases: "Кейсы",
  "Music Kits": "Музыкальные наборы",
  Collectibles: "Коллекционные",
  Keys: "Ключи",
  Equipment: "Снаряжение",
  Misc: "Разное",
};

export function categoryLabel(value: string | null | undefined): string {
  if (!value) return "Прочее";
  return CATEGORY_LABELS[value] ?? value;
}

const WEAR_LABELS: Record<string, string> = {
  "Factory New": "Прямо с завода",
  "Minimal Wear": "Немного поношенное",
  "Field-Tested": "После полевых испытаний",
  "Well-Worn": "Поношенное",
  "Battle-Scarred": "Закалённое в боях",
};

export function wearLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return WEAR_LABELS[value] ?? value;
}

const KIND_LABELS: Record<string, string> = {
  skin: "Скин",
  case: "Кейс",
  sticker: "Наклейка",
  agent: "Агент",
  key: "Ключ",
  music_kit: "Музыкальный набор",
  charm: "Брелок",
  patch: "Нашивка",
  graffiti: "Граффити",
  collectible: "Коллекционное",
  other: "Предмет",
};

export function kindLabel(value: string | null | undefined): string {
  if (!value) return "Предмет";
  return KIND_LABELS[value] ?? value;
}

const STATUS_LABELS: Record<string, string> = {
  live: "Подключён",
  dataset: "Импорт датасета",
  credentials_required: "Нужны учётные данные",
  planned: "Планируется",
  disabled: "Отключён",
};

export function integrationStatusLabel(value: string | null | undefined): string {
  if (!value) return "Неизвестно";
  return STATUS_LABELS[value] ?? value;
}

const FEE_STATUS_LABELS: Record<string, string> = {
  verified: "Подтверждено документацией",
  reported: "По публичным обзорам",
  conflicting: "Источники противоречат",
  unverified: "Не проверено",
};

export function feeStatusLabel(value: string | null | undefined): string {
  if (!value) return FEE_STATUS_LABELS.unverified;
  return FEE_STATUS_LABELS[value] ?? value;
}

const PRICE_KIND_LABELS: Record<string, string> = {
  lowest_ask: "минимальный лот",
  median_sale: "медиана продаж",
  highest_bid: "максимальный бид",
  suggested: "рекомендованная цена",
  last_sale: "последняя сделка",
};

export function priceKindLabel(value: string | null | undefined): string {
  if (!value) return "цена";
  return PRICE_KIND_LABELS[value] ?? value;
}

export function pluralize(count: number, forms: [string, string, string]): string {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

export function shortMarketName(name: string): string {
  const map: Record<string, string> = {
    "steam-community": "Steam",
    skinport: "Skinport",
    csfloat: "CSFloat",
    buff163: "BUFF163",
    dmarket: "DMarket",
    skinbaron: "SkinBaron",
    lisskins: "LIS-SKINS",
    "dataset:csgo-api": "CSGO-API",
    "dataset:steam-price-tracker": "Steam Tracker",
  };
  return map[name] ?? name;
}
