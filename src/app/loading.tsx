import { BrandMark } from "@/components/icons";

/**
 * Состояние загрузки: первый запуск может включать импорт набора данных,
 * поэтому страница показывает скелетон, а не пустой экран.
 */
export default function Loading() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <BrandMark />
          </span>
          <div>
            <div className="brand-title">CS2 Index</div>
            <div className="brand-sub">аналитика цен предметов</div>
          </div>
        </div>
        <div className="sidebar-status">
          <div className="sidebar-status-head">СОСТОЯНИЕ ДАННЫХ</div>
          <span className="muted small">Инициализация базы и загрузка набора…</span>
        </div>
      </aside>
      <main className="main-frame">
        <div className="page-content">
          <div className="skeleton">
            <div className="skeleton-row" />
            <div className="skeleton-row" />
            <div className="skeleton-row" />
            <div className="skeleton-row" />
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </div>
          <p className="muted">
            Первый запуск применяет миграции и загружает проверенный набор данных (около 30 секунд). Дальнейшие старты используют готовую базу.
          </p>
        </div>
      </main>
    </div>
  );
}
