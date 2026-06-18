import type { SavedGame } from '../types/puzzle';

const STORAGE_PREFIX = 'jigsaw:save:';
const ACTIVE_KEY = 'jigsaw:active';

export function saveGame(key: string, game: SavedGame): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(game));
    localStorage.setItem(ACTIVE_KEY, key);
  } catch {
    // Storage can fail (quota, private mode) - the game just won't resume after refresh.
  }
}

export function loadGame(key: string): SavedGame | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as SavedGame;
  } catch {
    return null;
  }
}

export function getActiveGameKey(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function clearGame(key: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
    if (localStorage.getItem(ACTIVE_KEY) === key) {
      localStorage.removeItem(ACTIVE_KEY);
    }
  } catch {
    // ignore
  }
}

export function makeGameKey(imageId: string, rows: number, cols: number): string {
  return `${imageId}:${rows}x${cols}`;
}
