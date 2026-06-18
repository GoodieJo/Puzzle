import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PieceStyle, PuzzleConfig, PuzzleImageMeta } from '../types/puzzle';

export type Screen = 'home' | 'upload' | 'difficulty' | 'workspace';

export interface Settings {
  theme: 'light' | 'dark';
  highContrast: boolean;
  pieceStyle: PieceStyle;
  allowRotation: boolean;
  soundOn: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  theme: 'light',
  highContrast: false,
  pieceStyle: 'classic',
  allowRotation: false,
  soundOn: true,
};

const SETTINGS_KEY = 'jigsaw:settings';

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface AppContextValue {
  screen: Screen;
  goTo: (screen: Screen) => void;
  selectedImage: PuzzleImageMeta | null;
  setSelectedImage: (img: PuzzleImageMeta | null) => void;
  config: PuzzleConfig | null;
  setConfig: (config: PuzzleConfig | null) => void;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedImage, setSelectedImage] = useState<PuzzleImageMeta | null>(null);
  const [config, setConfig] = useState<PuzzleConfig | null>(null);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // ignore persistence failures (private mode, quota, etc.)
    }
  }, [settings]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
    document.documentElement.setAttribute('data-contrast', settings.highContrast ? 'high' : 'normal');
  }, [settings.theme, settings.highContrast]);

  const value = useMemo<AppContextValue>(
    () => ({
      screen,
      goTo: setScreen,
      selectedImage,
      setSelectedImage,
      config,
      setConfig,
      settings,
      updateSettings: (patch) => setSettings((s) => ({ ...s, ...patch })),
    }),
    [screen, selectedImage, config, settings]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
