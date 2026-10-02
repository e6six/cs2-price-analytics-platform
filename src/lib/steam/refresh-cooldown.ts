/** Decide whether a recent stored Steam quote can satisfy a refresh request. */
export function getSteamRefreshCooldown(
  capturedAt: Date | null | undefined,
  cooldownSeconds: number,
  nowMs = Date.now(),
): { reuse: boolean; remainingSeconds: number } {
  if (!capturedAt) return { reuse: false, remainingSeconds: 0 };
  const ageSeconds = Math.max(0, (nowMs - capturedAt.getTime()) / 1000);
  const remainingSeconds = Math.max(0, Math.ceil(cooldownSeconds - ageSeconds));
  return {
    reuse: remainingSeconds > 0,
    remainingSeconds,
  };
}
