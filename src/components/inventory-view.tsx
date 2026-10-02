"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Badge, EmptyState, ItemArt, Panel, StatCard, Tabs } from "@/components/ui";
import { STORAGE_KEYS, useStoredString } from "@/lib/client-store";
import type { InventoryItemView, InventoryPriceView, InventoryValuation } from "@/lib/analytics/types";
import { formatAge, formatDateTime, formatNumber, formatUsd, shortMarketName } from "@/lib/format";

type ValuationBasis = "steam" | "external";
type ValuationResponse = InventoryValuation & { notes?: string[] };

function UnitPrice({ price }: { price: InventoryPriceView | null }) {
  if (!price) return <span className="muted">—</span>;
  return (
    <div className="inventory-price">
      <strong>{formatUsd(price.priceUsd)}</strong>
      <span className="muted small">
        {shortMarketName(price.marketId)} · {formatAge(price.ageHours)}
        {!price.isLive ? " · датасет" : ""}
      </span>
      {price.isStale ? <Badge tone="warning">Устарела</Badge> : null}
    </div>
  );
}

function inventoryItemValue(item: InventoryItemView, basis: ValuationBasis): number | null {
  if (!item.marketable) return null;
  const price = item[basis]?.priceUsd;
  return price === undefined ? null : price * item.amount;
}

export function InventoryView() {
  const [steamId64, setSteamId64] = useStoredString(STORAGE_KEYS.steamId64, "");
  const [valuation, setValuation] = useState<ValuationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [basis, setBasis] = useState<ValuationBasis>("steam");

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/inventory/valuation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ steamId64 }),
      });
      const payload = (await response.json().catch(() => ({}))) as ValuationResponse & { error?: { message?: string } };
      if (!response.ok || !payload.items) {
        throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
      }
      setValuation(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  const visibleItems = useMemo(() => {
    if (!valuation) return [];
    const query = search.trim().toLowerCase();
    return valuation.items
      .filter((item) => !query || item.name.toLowerCase().includes(query) || (item.marketHashName ?? "").toLowerCase().includes(query))
      .slice()
      .sort((a, b) => (inventoryItemValue(b, basis) ?? -1) - (inventoryItemValue(a, basis) ?? -1));
  }, [valuation, search, basis]);

  const marketableAssets = valuation?.totals.marketableAssets ?? 0;
  const pricedAssets = basis === "steam" ? valuation?.totals.steamPricedAssets ?? 0 : valuation?.totals.externalPricedAssets ?? 0;
  const portfolioValue = basis === "steam" ? valuation?.totals.steamValueUsd : valuation?.totals.externalValueUsd;

  return (
    <div className="view-stack">
      <div className="banner banner-neutral">
        <div className="banner-title">Оценка публичного инвентаря CS2</div>
        <div className="banner-body">
          Нужен 17-значный SteamID64 или ссылка профиля вида steamcommunity.com/profiles/…. Инвентарь должен быть открыт. ID сохраняется только в
          localStorage этого браузера, на сервере список предметов не хранится.
        </div>
      </div>

      <Panel title="Профиль Steam" subtitle="Читаем CS2-инвентарь без входа в аккаунт и Steam-cookie">
        <form className="inventory-form" onSubmit={(event) => void calculate(event)}>
          <label className="field inventory-id-field">
            <span>SteamID64 или ссылка /profiles/…</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={200}
              value={steamId64}
              onChange={(event) => setSteamId64(event.target.value)}
              placeholder="7656119XXXXXXXXXX"
              aria-label="SteamID64"
            />
          </label>
          <button type="submit" className="primary-button" disabled={loading || !steamId64.trim()}>
            {loading ? "Считаю инвентарь…" : valuation ? "⟳ Пересчитать" : "Рассчитать стоимость"}
          </button>
        </form>
        {error ? <div className="inventory-error" role="alert">{error}</div> : null}
        {loading ? <p className="muted small">Большой инвентарь может загружаться дольше: Steam ограничивает частоту запросов.</p> : null}
      </Panel>

      {valuation ? (
        <>
          <div className="stats-grid">
            <StatCard
              label="Стоимость по Steam Market"
              value={formatUsd(valuation.totals.steamValueUsd)}
              hint={`цена Steam Wallet · покрытие ${formatNumber(valuation.totals.steamPricedAssets)} / ${formatNumber(marketableAssets)}`}
              tone="lime"
            />
            <StatCard
              label="Оценка по внешним площадкам"
              value={formatUsd(valuation.totals.externalValueUsd)}
              hint={`по минимальным доступным котировкам · покрытие ${formatNumber(valuation.totals.externalPricedAssets)} / ${formatNumber(marketableAssets)}`}
              tone="blue"
            />
            <StatCard
              label="Предметов для продажи"
              value={formatNumber(marketableAssets)}
              hint={`${formatNumber(valuation.totals.unmarketableAssets)} не торгуются на Steam`}
              tone="violet"
            />
            <StatCard
              label="Получен срез"
              value={formatDateTime(valuation.fetchedAt)}
              hint={`${formatNumber(valuation.items.length)} групп · страниц Steam: ${valuation.pagesFetched}`}
              tone="amber"
            />
          </div>

          <Panel
            title="Предметы инвентаря"
            subtitle={`Оценка ${basis === "steam" ? "по Steam Market" : "по самой низкой внешней котировке"} · всего ${formatNumber(valuation.totals.assets)} предметов`}
            actions={
              <Tabs
                value={basis}
                onChange={setBasis}
                options={[
                  { id: "steam", label: "Steam Market", hint: "Steam Wallet, без вывода денег" },
                  { id: "external", label: "Другие площадки", hint: "Минимальная котировка среди внешних источников" },
                ]}
              />
            }
          >
            {valuation.truncated ? (
              <div className="banner banner-warning inventory-truncated">
                Инвентарь больше лимита безопасной загрузки: показаны первые {formatNumber(valuation.items.reduce((sum, item) => sum + item.amount, 0))} предметов. Всего в Steam: {formatNumber(valuation.totalInventoryCount)}.
              </div>
            ) : null}
            <div className="inventory-toolbar">
              <label className="field inventory-search-field">
                <span>Фильтр предметов</span>
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="AK-47, наклейка…" />
              </label>
              <span className="muted small">
                Оценено по выбранному источнику: {formatNumber(pricedAssets)} / {formatNumber(marketableAssets)} предметов
              </span>
            </div>
            {visibleItems.length ? (
              <div className="table-scroll">
                <table className="item-table inventory-table">
                  <thead>
                    <tr>
                      <th>Предмет</th>
                      <th>Кол-во</th>
                      <th>Steam · за шт.</th>
                      <th>Внешняя цена · за шт.</th>
                      <th>Сумма по выбранному источнику</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((item, index) => (
                      <tr key={`${item.marketHashName ?? item.name}-${item.marketable ? "marketable" : "no-market"}-${index}`}>
                        <td>
                          <div className="item-cell">
                            <ItemArt imageUrl={item.imageUrl} name={item.name} size={40} />
                            <div>
                              <div className="item-name">
                                {item.marketHashName ? (
                                  <a href={`https://steamcommunity.com/market/listings/730/${encodeURIComponent(item.marketHashName)}`} target="_blank" rel="noreferrer noopener">
                                    {item.name}
                                  </a>
                                ) : item.name}
                              </div>
                              <div className="item-sub">
                                {item.marketable ? item.marketHashName ?? "Имя на Steam Market отсутствует" : "Не продаётся на Steam Market"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="num">{formatNumber(item.amount)}</td>
                        <td><UnitPrice price={item.steam} /></td>
                        <td><UnitPrice price={item.external} /></td>
                        <td className="num">
                          {inventoryItemValue(item, basis) === null ? "—" : formatUsd(inventoryItemValue(item, basis))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="Предметы не найдены" hint={search ? "Измените поисковый запрос" : "В Steam-инвентаре нет предметов"} />
            )}
          </Panel>

          <div className="banner banner-warning">
            <div className="banner-title">Как читать оценку</div>
            <div className="banner-body">
              {valuation.notes?.map((note) => <div key={note}>{note}</div>)}
              {valuation.truncated ? <div>Если Steam вернул больше 20&nbsp;000 записей, итог относится только к загруженной части инвентаря.</div> : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
