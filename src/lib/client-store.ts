"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Хранилище настроек в localStorage, совместимое с SSR.
 *
 * `useSyncExternalStore` даёт корректный серверный снимок и синхронизацию между
 * вкладками, а также избавляет от записи состояния в эффектах (иначе React
 * выполняет лишние каскадные рендеры).
 */
const listeners = new Map<string, Set<() => void>>();

function emit(key: string): void {
  const set = listeners.get(key);
  if (!set) return;
  for (const listener of set) listener();
}

function subscribe(key: string, listener: () => void): () => void {
  const set = listeners.get(key) ?? new Set<() => void>();
  set.add(listener);
  listeners.set(key, set);

  const onStorage = (event: StorageEvent) => {
    if (event.key === key) emit(key);
  };
  window.addEventListener("storage", onStorage);

  return () => {
    set.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Приватный режим или переполнение хранилища: настройка просто не сохранится.
  }
  emit(key);
}

export function useStoredString(key: string, fallback: string): [string, (value: string) => void] {
  const value = useSyncExternalStore(
    useCallback((listener: () => void) => subscribe(key, listener), [key]),
    useCallback(() => read(key), [key]),
    useCallback(() => fallback, [fallback]),
  );

  const setValue = useCallback((next: string) => write(key, next), [key]);
  return [value ?? fallback, setValue];
}

export function useStoredList(key: string): [string[], (updater: (current: string[]) => string[]) => void] {
  const raw = useSyncExternalStore(
    useCallback((listener: () => void) => subscribe(key, listener), [key]),
    useCallback(() => read(key), [key]),
    useCallback(() => "[]", []),
  );

  const items = useMemo(() => {
    try {
      const parsed = JSON.parse(raw ?? "[]") as unknown;
      return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
    } catch {
      return [];
    }
  }, [raw]);

  const update = useCallback(
    (updater: (current: string[]) => string[]) => {
      const current = (() => {
        try {
          const parsed = JSON.parse(read(key) ?? "[]") as unknown;
          return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
        } catch {
          return [];
        }
      })();
      write(key, JSON.stringify(updater(current)));
    },
    [key],
  );

  return [items, update];
}

export const STORAGE_KEYS = {
  watchlist: "cs2-index:watchlist",
  theme: "cs2-index:theme",
  steamId64: "cs2-index:steam-id64",
} as const;
