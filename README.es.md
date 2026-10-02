<p align="center">
  <img src="docs/assets/banner.png" alt="CS2 Index — análisis de precios independiente para objetos de Counter-Strike 2" width="100%">
</p>

<div align="center">

# CS2 Index

**Análisis de precios independiente para objetos de Counter-Strike 2.** Un catálogo de 34 029 objetos, comparación de ofertas entre plataformas, historial semanal de precios, directorio de plataformas y calculadora de pago — sobre instantáneas de datos abiertas, con procedencia para cada cifra.

[![Next.js 16](https://img.shields.io/badge/Next.js-16.2-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![TypeScript 5.9](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.45-C5F74F?logo=drizzle&logoColor=black)](https://orm.drizzle.team)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![PGlite integrado](https://img.shields.io/badge/integrado-PGlite-4B5563)](https://pglite.dev)
[![Pruebas](https://img.shields.io/badge/pruebas-16_correctas-3FB950)](tests)
[![Licencia de datos MIT](https://img.shields.io/badge/datos-MIT-2EA44F)](data/bootstrap/manifest.json)

[English](README.md) · [Русский](README.ru.md) · [中文](README.zh.md) · **Español**

</div>

---

## Qué es — y qué no es

CS2 Index responde bien a una pregunta concreta: *¿cuánto vale este objeto ahora, cómo cambió y de dónde sale ese número?*

- **Datos reales de una instantánea, no cotizaciones de demostración.** El repositorio incluye un conjunto de datos abierto y reproducible (`data/bootstrap`, 3,1 MB, con sumas de verificación en el manifiesto) que la aplicación carga en el primer arranque.
- **Sin operaciones de trading, sin custodia de fondos y sin cuentas.** El servicio solo muestra datos. No está afiliado a Valve Corporation.
- **Sin valores inventados.** Si no hay cotización, la interfaz muestra `—`, nunca `0` ni una estimación.

## Capturas de pantalla

| Resumen del mercado (tema oscuro) | Resumen del mercado (tema claro) |
| --- | --- |
| ![Resumen](docs/assets/screens/overview.png) | ![Resumen, tema claro](docs/assets/screens/overview-light.png) |

| Catálogo con filtros | Ficha del objeto |
| --- | --- |
| ![Catálogo](docs/assets/screens/catalog.png) | ![Ficha](docs/assets/screens/item.png) |

| Directorio de plataformas | Fuentes de datos y procedencia |
| --- | --- |
| ![Plataformas](docs/assets/screens/markets.png) | ![Fuentes](docs/assets/screens/data.png) |

## Los datos que hay detrás

| Métrica | Valor |
| --- | --- |
| Objetos en el catálogo | 34 029 — skins, pegatinas, cajas, agentes, grafitis, llaveros, kits de música, parches, coleccionables, llaves |
| Ofertas (cotizaciones) | 27 717 en la fecha de la instantánea |
| Historial | 25 850 objetos × 25 fechas semanales (2026-02-08 … 2026-08-08), 631 840 puntos |
| Semántica del precio | precio mínimo de una publicación activa en el Mercado de la Comunidad de Steam, USD |
| Fuentes | [ByMykel/CSGO-API](https://github.com/ByMykel/CSGO-API) (MIT) — metadatos; [ByMykel/counter-strike-price-tracker](https://github.com/ByMykel/counter-strike-price-tracker) (MIT) — instantáneas semanales de precios de Steam |

Principios que el código aplica de verdad:

- **Cada precio conserva su procedencia** — fuente, tipo de precio, moneda, hora de captura y enlace al original (`cs2_price_quotes.source_url`, tabla `cs2_source_health`, manifiesto del conjunto).
- **La ausencia de datos queda explícita** — sin cotización no hay fila; la interfaz muestra `—` en lugar de un cero o una suposición.
- **Las comisiones no verificadas nunca se afirman como hecho** — las plataformas llevan estado `reported` / `conflicting` con enlace de origen y fecha de verificación; cuando el estado es `conflicting`, los porcentajes no se muestran en absoluto.
- **Las series poco fiables se marcan, no se «arreglan» a ojo** — si observaciones semanales contiguas difieren más de 5×, no se calculan variaciones (`change_7d = null`, indicador `changeSuppressed`).
- **Las variaciones se suavizan y las fechas se explicitan** — el valor actual y los puntos de comparación de 7/30/90 días son medianas de tres observaciones; la fecha de comparación se devuelve por separado (`change7dFrom`), porque el conjunto es semanal y «exactamente una semana atrás» puede no existir.

La instantánea no es un flujo en tiempo real. La frescura se ve en la interfaz (insignia de antigüedad) y en `GET /api/health`. Los datos actualizados llegan por sincronización (`npm run sync`, `POST /api/sync`).

## Arquitectura

<img src="docs/assets/architecture.png" alt="Flujo de datos: fuentes abiertas → ingesta → almacenamiento → API e interfaz" width="100%">

Los adaptadores de plataformas comparten un mismo contrato (`src/lib/ingest/providers`), el ejecutor mantiene un cortacircuitos por fuente y un diario de ejecuciones, y las estadísticas materializadas (`refreshItemStats`) se reconstruyen en una sola pasada tras la importación y cada sincronización — así el catálogo y el resumen no ejecutan funciones de ventana sobre todo el historial en cada petición.

## Funciones

- **Catálogo** — búsqueda por nombre, filtros (categoría, arma, rareza, colección, desgaste, StatTrak™, Souvenir, rango de precio, solo con precio), 8 ordenaciones y paginación.
- **Ficha del objeto** — mejor/precio medio/peor, diferencial entre plataformas, variaciones de 7/30/90 días con fechas de comparación, gráfico de historial, tabla de ofertas con procedencia y caducidad, lista de plataformas sin cotización.
- **Resumen del mercado** — frescura, índice (mediana de la relación de precios de la cesta respecto a la fecha base), amplitud del mercado (suben/bajan/sin cambios), líderes de subida y bajada, objetos más líquidos.
- **Directorio de plataformas** — estado de integración, comisiones con estado de verificación, KYC, límites de peticiones, estado del cortacircuitos, número de cotizaciones.
- **Página de fuentes** — tablas de fuentes y ejecuciones, composición del conjunto bootstrap, licencias y atribución, descargo de responsabilidad.
- **Calculadora de pago** — cálculo a partir de una cotización real y una comisión elegida explícitamente.
- **Interfaz** — tema claro y oscuro sin parpadeo al cargar, tipografía Inter local (latino + cirílico), `/` enfoca la búsqueda, diseño adaptable, localización en ruso y favoritos en `localStorage`.
- **API** — envoltura de error unificada, límite de peticiones, caché y métricas de Prometheus.

## Inicio rápido

```bash
git clone https://github.com/e6six/cs2-price-analytics-platform.git
cd cs2-price-analytics-platform
npm install
npm run dev          # http://localhost:3000
```

Sin `DATABASE_URL` la aplicación levanta un PostgreSQL integrado (PGlite) en `.cache/pglite`, aplica las migraciones e importa el conjunto de `data/bootstrap`. El primer arranque tarda uno o dos minutos; los siguientes reutilizan la base de datos en disco.

Modo producción:

```bash
export DATABASE_URL=postgresql://cs2:cs2@127.0.0.1:5432/cs2_index
npm run db:migrate && npm run db:seed -- --refresh
npm run build && npm run start
```

Lista completa de variables de entorno — [`.env.example`](.env.example). Los secretos (tokens de plataformas, `SYNC_TOKEN`) viven solo en el entorno.

## Scripts

| Comando | Propósito |
| --- | --- |
| `npm run dev` / `build` / `start` | Desarrollo, compilación, servidor de producción |
| `npm run lint` / `typecheck` / `test` / `verify` | ESLint, TypeScript, pruebas (node:test), todo junto |
| `npm run db:migrate` | Aplicar migraciones de Drizzle |
| `npm run db:seed` | Importar el conjunto en una base vacía (idempotente) |
| `npm run db:seed -- --refresh` | Reimportar `data/bootstrap` a la fuerza |
| `npm run db:seed -- --stats` | Reconstruir estadísticas materializadas |
| `npm run data:fetch` | Clonar/actualizar los conjuntos abiertos en `.cache/sources` |
| `npm run data:bootstrap` | Reconstruir `data/bootstrap/*` y el manifiesto de sumas |
| `npm run sync -- --source=steam-community --limit=50` | Una ejecución de sincronización |
| `npm run db:studio` | Drizzle Studio |

## API

Todas las respuestas son JSON; los errores usan `{ "error": { "code", "message", "details" }, "requestId" }` con cabeceras `x-request-id` y `cache-control`.

| Método y ruta | Propósito |
| --- | --- |
| `GET /api/health` | Estado de la base y los datos: `200` listo, `503` vacío/no disponible, frescura |
| `GET /api/items` | Catálogo: `q`, `category`, `kind`, `weapon`, `rarity`, `collection`, `wear`, `stattrak`, `souvenir`, `minPrice`, `maxPrice`, `requirePrice`, `slugs` (hasta 60), `sort` (8 valores), `page`, `limit` (≤100) |
| `GET /api/items/{id\|slug}?range=7d\|30d\|90d\|365d` | Ficha: ofertas, historial, estadísticas |
| `GET /api/items/{id}/history?range=…&market=…` | Serie temporal (la ventana se cuenta desde la última observación del objeto) |
| `GET /api/markets` | Directorio de plataformas y comisiones |
| `GET /api/analytics/summary` | Resumen del mercado: frescura, cobertura, índice, amplitud, líderes |
| `GET /api/facets` | Valores de filtro con recuento de objetos |
| `GET /api/sources` | Estados de las fuentes y ejecuciones recientes |
| `GET /api/metrics` | Métricas de Prometheus (`cs2_db_up`, `cs2_items_total`, `cs2_data_age_hours`, `cs2_market_index`, …) |
| `GET /api/sync` / `POST /api/sync` | Estado / ejecución de sincronización (`Authorization: Bearer $SYNC_TOKEN`) |

## Modelo de datos

`src/db/schema.ts`:

- `cs2_markets` — directorio de plataformas y conjuntos: estado de integración, si requiere clave, semántica de precio, comisiones con estado de verificación, KYC, límites.
- `cs2_items` — objetos canónicos (`market_hash_name`, metadatos, imagen, `popularity` = proporción de fechas con precio).
- `cs2_price_quotes` — instantáneas de ofertas: `price_kind`, precio, moneda, `price_usd`, `captured_at`, `source_url`, `is_live`.
- `cs2_price_history_daily` — series diarias/semanales (único por `item + market + date + price_kind`).
- `cs2_item_stats` — métricas materializadas: mejor/precio medio, plataforma líder, variaciones suavizadas de 7/30/90 días con fechas de comparación, cobertura del historial, indicador `series_noisy`.
- `cs2_ingest_runs`, `cs2_source_health` — diario de ejecuciones y estado de fuentes (cortacircuitos, errores, contadores).
- `cs2_fx_rates` — tipos del BCE para normalizar monedas (respaldo: valores estáticos marcados como `static`).

## Fuentes, límites y cumplimiento

- **Mercado de la Comunidad de Steam** — endpoint público `market/priceoverview`; el adaptador mantiene ≤12 peticiones/min, respeta `Retry-After`, usa retroceso y cortacircuitos. El historial completo (`market/pricehistory`) requiere la cookie del titular de la cuenta (`STEAM_MARKET_COOKIE`).
- **Skinport** — API pública `/v1/items` (USD, `tradable`), caché de 5 minutos, recomendación de ≤8 peticiones por 5 minutos.
- **CSFloat** — `listings/price-list` público; con clave los límites son mayores.
- **BUFF163** — solo sesión autorizada (`BUFF_COOKIE`), CNY, ≤10 peticiones/min.
- **Conjuntos abiertos** (GitHub, MIT) — actualización masiva de precios y metadatos vía Contents API.
- **Plataformas previstas** (DMarket, SkinBaron, Tradeit, LIS-SKINS, SkinsMonkey) existen solo en el directorio: no hay adaptadores hasta confirmar los términos de la API.

Reglas del proyecto: no eludir CAPTCHA, Cloudflare, autorización ni protecciones anti-bot; no usar proxies para esquivar límites; no afirmar comisiones, pagos o KYC no verificados como hechos; no sustituir la falta de datos por estimaciones; no republicar datos de plataformas sin permiso de sus términos.

## Operación

- **Frescura**: `GET /api/health` y la métrica `cs2_data_age_hours` (`isStale` — más de 14 días). La interfaz marca los datos como obsoletos.
- **Sincronización**: `npm run sync` o `POST /api/sync` con `SYNC_TOKEN`; para actualizaciones programadas use cron o un worker (`AUTO_BOOTSTRAP=true` solo es necesario en el primer arranque).
- **Observabilidad**: logs JSON estructurados, `GET /api/metrics` (Prometheus).
- **Límite de peticiones**: actualmente en memoria del proceso — con varias réplicas hace falta Redis o una pasarela con limitación.
- **Copias de seguridad**: para PGlite basta un archivo del directorio `.cache/pglite`; para PostgreSQL, los procedimientos habituales.
- **Retención**: `QUOTE_RETENTION_DAYS` limita cuánto tiempo se guardan las instantáneas antiguas de ofertas.

## Limitaciones

- El conjunto incluido contiene instantáneas semanales; «variación de 7 días» significa la observación disponible más cercana, y la fecha siempre la devuelve la API.
- Los objetos Souvenir de los conjuntos abiertos contienen valores atípicos con más frecuencia — esas series se marcan como inestables en lugar de «corregirse» a ojo.
- No hay operaciones de compraventa, custodia de fondos, autenticación de Steam ni notificaciones: el servicio solo muestra datos. No está afiliado a Valve Corporation.
- Las localizaciones de Valve no están conectadas: los nombres de los objetos se mantienen en su forma canónica en inglés.
- En el conjunto actual `steam-community` está marcado como `isLive: false` — es una instantánea del conjunto, no una petición a Steam en el momento de mostrar.
- Las imágenes se cargan desde la CDN de Valve y no se incluyen en el repositorio; si la CDN no responde, la tarjeta muestra un monograma con el color de la rareza.

## Licencia y atribución

El código del proyecto se distribuye dentro de este repositorio. Datos:

- [ByMykel/CSGO-API](https://github.com/ByMykel/CSGO-API) — MIT, Copyright (c) 2023 ByMykel.
- [ByMykel/counter-strike-price-tracker](https://github.com/ByMykel/counter-strike-price-tracker) — MIT, Copyright (c) 2026 ByMykel.
- Tipografía Inter — SIL Open Font License 1.1 (`src/fonts/inter/LICENSE.txt`).

Los commits usados para construir el conjunto están fijados en `data/bootstrap/manifest.json` junto con las sumas de verificación. Los nombres e imágenes de los objetos pertenecen a Valve Corporation; el proyecto no reclama derechos sobre ellos.

<div align="center">

[English](README.md) · [Русский](README.ru.md) · [中文](README.zh.md) · **Español**

</div>
