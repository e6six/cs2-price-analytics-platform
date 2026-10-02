import type { Provider } from "@/lib/ingest/types";
import { steamCommunityProvider } from "@/lib/ingest/providers/steam-community";
import { steamDatasetProvider } from "@/lib/ingest/providers/steam-dataset";
import { skinportProvider } from "@/lib/ingest/providers/skinport";
import { csfloatProvider } from "@/lib/ingest/providers/csfloat";
import { buff163Provider } from "@/lib/ingest/providers/buff163";

/**
 * Реестр адаптеров. Порядок важен: bulk-источники выполняются раньше
 * точечных, чтобы точечное обновление работало уже по наполненному каталогу.
 */
export const providers: Provider[] = [
  steamDatasetProvider,
  skinportProvider,
  csfloatProvider,
  buff163Provider,
  steamCommunityProvider,
];

export function getProvider(id: string): Provider | undefined {
  return providers.find((provider) => provider.id === id);
}

export function listProviderStatus(): Array<{
  id: string;
  marketId: string;
  label: string;
  mode: Provider["mode"];
  requiresCredentials: boolean;
  enabled: boolean;
  disabledReason: string | null;
}> {
  return providers.map((provider) => {
    const reason = provider.disabledReason?.() ?? null;
    return {
      id: provider.id,
      marketId: provider.marketId,
      label: provider.label,
      mode: provider.mode,
      requiresCredentials: provider.requiresCredentials,
      enabled: reason === null,
      disabledReason: reason,
    };
  });
}

export { steamCommunityProvider, steamDatasetProvider, skinportProvider, csfloatProvider, buff163Provider };
