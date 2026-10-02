export type ItemSummary = {
  id: number;
  slug: string;
  name: string;
  weapon: string;
  skin: string;
  category: string;
  rarity: string;
  collection: string;
  wear: string;
  stattrak: boolean;
  souvenir: boolean;
  paintSeed: number;
  floatValue: number;
  demand: number;
  change24h: number;
  artTheme: string;
  currentPrice: number;
  sellerPayout: number;
  bestMarket: string;
  listingCount: number;
  capturedAt: string | null;
};

export type HistoryPoint = {
  date: string;
  lowPrice: number;
  medianPrice: number;
  volume: number;
};

export type MarketSummary = {
  id: string;
  name: string;
  shortName: string;
  region: string;
  website: string;
  integrationStatus: string;
  integrationType: string;
  buyerFeePercent: number | null;
  sellerFeePercent: number | null;
  feeStatus: string;
  kycPolicy: string;
  listingCount: number;
};

export type PriceOffer = {
  id: number;
  marketId: string;
  marketName: string;
  marketShortName: string;
  region: string;
  currency: string;
  buyerPrice: number;
  sellerPayout: number;
  capturedAt: string;
  isDemo: boolean;
};

export type ItemDetail = {
  item: ItemSummary;
  offers: PriceOffer[];
  history: HistoryPoint[];
};

export type DashboardSnapshot = {
  items: ItemSummary[];
  markets: MarketSummary[];
  history: HistoryPoint[];
  featuredItemId: number;
  updatedAt: string;
  metrics: {
    itemCount: number;
    marketCount: number;
    offerCount: number;
    historyDays: number;
  };
};
