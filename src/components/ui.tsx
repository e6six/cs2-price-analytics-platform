"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Icon, TrendTriangle, type IconName } from "@/components/icons";
import { formatAge, formatPercent, formatUsd } from "@/lib/format";

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <header className="panel-heading">
          <div>
            {title ? <h2 className="panel-title">{title}</h2> : null}
            {subtitle ? <p className="panel-subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="panel-actions">{actions}</div> : null}
        </header>
      )}
      {children}
    </section>
  );
}

export function Badge({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "negative" | "warning" | "accent" | "muted";
  title?: string;
}) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  );
}

export function ChangeValue({
  value,
  suffix = "%",
  showIcon = true,
  suppressed = false,
}: {
  value: number | null | undefined;
  suffix?: string;
  showIcon?: boolean;
  /** Ряд неустойчив: изменение не рассчитывается, и это нужно объяснить. */
  suppressed?: boolean;
}) {
  if (value === null || value === undefined) {
    return suppressed ? (
      <span className="change change-flat" title="Ряд цен неустойчив: изменение не рассчитывается">
        — <span className="change-note">ряд неустойчив</span>
      </span>
    ) : (
      <span className="change change-flat">—</span>
    );
  }
  const tone = value > 0 ? "positive" : value < 0 ? "negative" : "flat";
  return (
    <span className={`change change-${tone}`}>
      {showIcon && tone !== "flat" ? <TrendTriangle direction={tone === "positive" ? "up" : "down"} /> : null}
      {formatPercent(value)}
      {suffix !== "%" ? suffix : null}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  change,
  tone = "lime",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  change?: number | null;
  tone?: "lime" | "blue" | "violet" | "amber";
  icon?: IconName;
}) {
  return (
    <article className={`stat-card stat-${tone}`}>
      <div className="stat-head">
        {icon ? (
          <span className="stat-icon">
            <Icon name={icon} />
          </span>
        ) : null}
        <div className="stat-label">{label}</div>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">
        {change !== undefined ? <ChangeValue value={change} /> : null}
        {hint ? <span className="stat-hint">{hint}</span> : null}
      </div>
    </article>
  );
}

export function FreshnessBadge({
  capturedAt,
  ageHours,
  isStale,
}: {
  capturedAt: string | null;
  ageHours: number | null;
  isStale: boolean;
}) {
  const tone = capturedAt === null ? "warning" : isStale ? "warning" : "positive";
  const label =
    capturedAt === null
      ? "Нет данных"
      : `Снимок ${new Date(capturedAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
  return (
    <Badge tone={tone} title="Время последнего снимка цены, а не время запроса">
      <span className={`status-dot status-${tone}`} />
      {label} · {formatAge(ageHours)}
    </Badge>
  );
}
export function ItemArt({
  imageUrl,
  name,
  size = 44,
  rarityColor,
}: {
  imageUrl: string | null;
  name: string;
  size?: number;
  rarityColor?: string | null;
}) {
  // Если CDN изображений недоступен (блокировка, офлайн-контур), плитка
  // показывает монограмму, а не «сломанную картинку».
  const [failed, setFailed] = useState(false);
  const showImage = imageUrl !== null && imageUrl !== "" && !failed;

  return (
    <span
      className={rarityColor ? "item-art item-art-rarity" : "item-art"}
      style={
        {
          width: size,
          height: size,
          // Цвет редкости даёт предмету «оправу»: рамка, подсветка снизу и тень.
          "--rarity": rarityColor ?? undefined,
          borderColor: rarityColor ? `color-mix(in srgb, ${rarityColor} 45%, var(--border))` : undefined,
          background: rarityColor
            ? `radial-gradient(120% 120% at 30% 0%, ${rarityColor}2e, transparent 62%), linear-gradient(160deg, var(--surface-2), var(--surface))`
            : undefined,
        } as CSSProperties
      }
    >
      {showImage ? (
        // Изображения Valve размещены на CDN Steam; оптимизация Next для них отключена.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={name} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <span
          className="item-art-fallback"
          style={{ color: rarityColor ? `color-mix(in srgb, ${rarityColor} 72%, var(--text))` : undefined }}
        >
          {monogram(name)}
        </span>
      )}
    </span>
  );
}

/** Короткая монограмма для плитки без изображения: «AK-47 | Redline» → «AK». */
function monogram(name: string): string {
  const cleaned = name.replace(/[★™]/g, "").trim();
  const word = cleaned.split(/[\s|]+/).find((part) => /[\p{L}\p{N}]/u.test(part)) ?? cleaned;
  return word.slice(0, 2).toUpperCase();
}

export function StatusDot({ tone }: { tone: "positive" | "warning" | "negative" | "neutral" | "accent" }) {
  return <span className={`status-dot status-${tone}`} />;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-symbol">
        <Icon name="empty" />
      </div>
      <div>
        <div className="empty-title">{title}</div>
        {hint ? <div className="empty-hint">{hint}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function PriceCell({ value, hint }: { value: number | null; hint?: string }) {
  return (
    <div className="price-cell">
      <span className="price-value">{formatUsd(value)}</span>
      {hint ? <span className="price-hint">{hint}</span> : null}
    </div>
  );
}

export function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skeleton">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton-row" />
      ))}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ id: T; label: string; hint?: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="range-switch" role="tablist">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          className={value === option.id ? "range-button range-button-active" : "range-button"}
          onClick={() => onChange(option.id)}
          title={option.hint}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="info-row">
      <span className="info-label">{label}</span>
      <span className="info-value">{children}</span>
    </div>
  );
}

export function Banner({
  tone = "neutral",
  title,
  children,
}: {
  tone?: "neutral" | "warning" | "positive";
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`banner banner-${tone}`}>
      <div className="banner-title">{title}</div>
      {children ? <div className="banner-body">{children}</div> : null}
    </div>
  );
}
