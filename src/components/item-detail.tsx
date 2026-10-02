"use client";

import { useEffect, useState } from "react";
import type { ItemDetail } from "@/lib/analytics/types";
import { PriceChart } from "@/components/price-chart";
import { Badge, ChangeValue, EmptyState, InfoRow, ItemArt, Panel, Skeleton, Tabs } from "@/components/ui";
import { Icon } from "@/components/icons";
import {
  categoryLabel,
  formatDate,
  formatDateTime,
  formatNumber,
  formatUsd,
  integrationStatusLabel,
  kindLabel,
  priceKindLabel,
  rarityLabel,
  shortMarketName,
  wearLabel,
} from "@/lib/format";

type Range = "7d" | "30d" | "90d" | "365d";

const RANGE_LABELS: Record<Range, string> = { "7d": "7 дней", "30d": "30 дней", "90d": "90 дней", "365d": "Год" };

/**
 * Карточка предмета: котировки площадок с происхождением, история и статистика.
 * Данные запрашиваются по slug, поэтому ссылку на карточку можно сохранить.
 */
export function ItemDetailDrawer({
  slug,
  initial,
  onClose,
  onToggleWatch,
  isWatched,
}: {
  slug: string;
  initial?: ItemDetail | null;
  onClose: () => void;
  onToggleWatch: (slug: string) => void;
  isWatched: boolean;
}) {
  const [state, setState] = useState<{
    detail: ItemDetail | null;
    requestKey: string;
    error: string | null;
  }>({ detail: initial ?? null, requestKey: initial ? `${slug}:365d` : "", error: null });
  const [range, setRange] = useState<Range>("365d");
  const requestKey = `${slug}:${range}`;

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/items/${encodeURIComponent(slug)}?range=${range}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
        }
        return (await response.json()) as ItemDetail;
      })
      .then((payload) => setState({ detail: payload, requestKey: `${slug}:${range}`, error: null }))
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setState((current) => ({ ...current, error: cause instanceof Error ? cause.message : String(cause) }));
      });

    return () => controller.abort();
  }, [slug, range]);

  // Esc закрывает карточку: привычное ожидание для диалога.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const detail = state.detail;
  const loading = detail === null;
  const error = state.error;

  return (
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <aside className="drawer" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Карточка предмета">
        <header className="drawer-head">
          <div className="drawer-title">
            {detail ? (
              <>
                <ItemArt imageUrl={detail.item.imageUrl} name={detail.item.name} rarityColor={detail.item.rarityColor} size={56} />
                <div>
                  <div className="drawer-kicker">
                    {kindLabel(detail.item.kind)} · {categoryLabel(detail.item.category)} · {rarityLabel(detail.item.rarity)}
                  </div>
                  <h2>{detail.item.name}</h2>
                  <div className="drawer-sub">
                    {detail.item.collection ? `${detail.item.collection} · ` : ""}
                    {wearLabel(detail.item.wear)}
                    {detail.item.minFloat !== null ? ` · float ${detail.item.minFloat}–${detail.item.maxFloat}` : ""}
                  </div>
                </div>
              </>
            ) : (
              <div className="drawer-kicker">Загрузка…</div>
            )}
          </div>
          <div className="drawer-actions">
            <button
              type="button"
              className={isWatched ? "watch-button watch-on" : "watch-button"}
              onClick={() => onToggleWatch(slug)}
              title={isWatched ? "Убрать из избранного" : "В избранное"}
              aria-label="Избранное"
            >
              <Icon name="star" />
            </button>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть">
              <Icon name="close" />
            </button>
          </div>
        </header>

        <div className="drawer-body">
          {loading && !detail ? <Skeleton rows={6} /> : null}
          {error ? <EmptyState title="Не удалось загрузить предмет" hint={error} /> : null}

          {detail ? (
            <>
              <div className="detail-stats">
                <div className="detail-stat">
                  <span className="metric-label">Лучшая цена</span>
                  <strong>{formatUsd(detail.stats.bestPriceUsd)}</strong>
                  <span className="muted small">
                    {detail.item.bestMarketId ? shortMarketName(detail.item.bestMarketId) : "—"}
                  </span>
                </div>
                <div className="detail-stat">
                  <span className="metric-label">Средняя по площадкам</span>
                  <strong>{formatUsd(detail.stats.averagePriceUsd)}</strong>
                  <span className="muted small">спред {formatUsdSpread(detail.stats.spreadPercent)}</span>
                </div>
                <div className="detail-stat">
                  <span className="metric-label">7 дней</span>
                  <strong>
                    <ChangeValue
                      value={detail.stats.change7d}
                      showIcon={false}
                      suppressed={detail.stats.changeSuppressed}
                    />
                  </strong>
                  <span className="muted small">
                    30 дней:{" "}
                    <ChangeValue
                      value={detail.stats.change30d}
                      showIcon={false}
                      suppressed={detail.stats.changeSuppressed}
                    />
                  </span>
                </div>
                <div className="detail-stat">
                  <span className="metric-label">История</span>
                  <strong>
                    {detail.stats.historyFrom ? `${formatDate(detail.stats.historyFrom)} — ${formatDate(detail.stats.historyTo)}` : "—"}
                  </strong>
                  <span className="muted small">{formatNumber(detail.stats.points)} наблюдений</span>
                </div>
              </div>

              <Panel
                title="История цены"
                subtitle="Точки соответствуют снимкам источников; разрывы — отсутствие наблюдений, а не нулевая цена"
                actions={
                  <Tabs
                    value={range}
                    onChange={(next) => setRange(next)}
                    options={(Object.keys(RANGE_LABELS) as Range[]).map((id) => ({ id, label: RANGE_LABELS[id] }))}
                  />
                }
              >
                <PriceChart history={detail.history} height={200} />
              </Panel>

              <Panel title="Котировки площадок" subtitle="Цена покупателя, время снимка и происхождение значения">
                {detail.offers.length === 0 ? (
                  <EmptyState title="Нет котировок" hint="Для предмета ещё не собраны цены подключённых источников" />
                ) : (
                  <div className="table-scroll">
                    <table className="item-table">
                      <thead>
                        <tr>
                          <th>Площадка</th>
                          <th>Цена</th>
                          <th>Тип</th>
                          <th>Снимок</th>
                          <th>Данные</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {detail.offers.map((offer) => (
                          <tr key={`${offer.marketId}-${offer.priceKind}`}>
                            <td>
                              <div className="item-name">{offer.marketName}</div>
                              <div className="item-sub">{integrationStatusLabel(offer.integrationStatus)}</div>
                            </td>
                            <td className="num">
                              <div className="price-cell">
                                <span className="price-value">{formatUsd(offer.priceUsd)}</span>
                                {offer.currency !== "USD" ? <span className="price-hint">исходно {offer.price} {offer.currency}</span> : null}
                              </div>
                            </td>
                            <td>{priceKindLabel(offer.priceKind)}</td>
                            <td>
                              <div>{formatDateTime(offer.capturedAt)}</div>
                              <div className="muted small">возраст: {formatAgeHours(offer.ageHours)}</div>
                            </td>
                            <td>
                              {offer.isStale ? <Badge tone="warning">Устарела</Badge> : <Badge tone="positive">Актуальна</Badge>}
                              {offer.isLive ? null : <Badge tone="neutral">датасет</Badge>}
                            </td>
                            <td>
                              {offer.sourceUrl ? (
                                <a className="link-button" href={offer.sourceUrl} target="_blank" rel="noreferrer noopener">
                                  Источник
                                </a>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {detail.offers.some((offer) => offer.note) ? (
                  <ul className="note-list">
                    {detail.offers
                      .filter((offer) => offer.note)
                      .map((offer) => (
                        <li key={`${offer.marketId}-note`}>
                          <strong>{offer.marketShortName}:</strong> {offer.note}
                        </li>
                      ))}
                  </ul>
                ) : null}
              </Panel>

              <Panel title="Площадки без котировок" subtitle="Почему источник не дал цену">
                <ul className="no-quote-list">
                  {detail.marketsWithoutQuotes.map((market) => (
                    <li key={market.marketId}>
                      <span>{market.name}</span>
                      <Badge tone={market.integrationStatus === "credentials_required" ? "warning" : "neutral"}>
                        {integrationStatusLabel(market.integrationStatus)}
                      </Badge>
                    </li>
                  ))}
                  {detail.marketsWithoutQuotes.length === 0 ? <li className="muted">Все подключённые площадки дали цену.</li> : null}
                </ul>
              </Panel>

              <Panel title="Свойства предмета">
                <div className="specs">
                  <InfoRow label="market_hash_name">{detail.item.marketHashName}</InfoRow>
                  <InfoRow label="Оружие">{detail.item.weapon ?? "—"}</InfoRow>
                  <InfoRow label="Скин">{detail.item.skin ?? "—"}</InfoRow>
                  <InfoRow label="Коллекция">{detail.item.collection ?? "—"}</InfoRow>
                  <InfoRow label="Износ">{wearLabel(detail.item.wear)}</InfoRow>
                  <InfoRow label="Границы float">
                    {detail.item.minFloat === null ? "—" : `${detail.item.minFloat} – ${detail.item.maxFloat}`}
                  </InfoRow>
                  <InfoRow label="Метки">
                    {detail.item.stattrak ? <Badge tone="accent">StatTrak™</Badge> : null}
                    {detail.item.souvenir ? <Badge tone="accent">Souvenir</Badge> : null}
                    {!detail.item.stattrak && !detail.item.souvenir ? <span className="muted">нет</span> : null}
                  </InfoRow>
                  <InfoRow label="В каталоге">id {detail.item.id} · slug {detail.item.slug}</InfoRow>
                </div>
              </Panel>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function formatUsdSpread(value: number | null): string {
  if (value === null) return "нет данных";
  return `${value.toFixed(1)}%`;
}

function formatAgeHours(hours: number): string {
  if (hours < 24) return `${Math.max(1, Math.round(hours))} ч`;
  return `${Math.round(hours / 24)} дн`;
}
