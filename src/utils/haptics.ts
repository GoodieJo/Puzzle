export function hapticPulse(durationMs = 12): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(durationMs);
    }
  } catch {
    // Vibration API not available - silently ignore.
  }
}
