import { useEffect, useState } from 'react';
import { PuzzleEngine } from '../engine/PuzzleEngine';
import type { PuzzleConfig } from '../types/puzzle';
import { useGameTimer } from './useGameTimer';
import { clearGame, loadGame, makeGameKey, saveGame } from '../utils/storage';

export function usePuzzleGame(config: PuzzleConfig | null) {
  const [engine, setEngine] = useState<PuzzleEngine | null>(null);
  const [gameKey, setGameKey] = useState<string | null>(null);
  const [moves, setMoves] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [engineVersion, setEngineVersion] = useState(0);

  const timer = useGameTimer(0, true);

  // (Re)build the engine whenever a new puzzle config arrives - restoring a
  // saved game for the same image+difficulty if one exists.
  useEffect(() => {
    if (!config) {
      setEngine(null);
      setGameKey(null);
      return;
    }
    const key = makeGameKey(config.imageId, config.rows, config.cols);
    const saved = loadGame(key);
    const sameShape =
      !!saved &&
      saved.config.rows === config.rows &&
      saved.config.cols === config.cols &&
      saved.config.imageId === config.imageId;

    setEngine(new PuzzleEngine(config, sameShape ? saved!.pieces : undefined));
    setGameKey(key);
    setMoves(sameShape ? saved!.stats.moves : 0);
    setCompleted(sameShape ? saved!.completed : false);
    timer.reset(sameShape ? saved!.stats.elapsedMs : 0, !(sameShape && saved!.completed));
    setEngineVersion((v) => v + 1);
    // timer.reset is stable across renders; config is the only meaningful dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const bumpVersion = () => setEngineVersion((v) => v + 1);
  const incrementMove = () => setMoves((m) => m + 1);
  const markComplete = () => {
    setCompleted(true);
    timer.pause();
  };

  // Autosave on a steady cadence and whenever key stats change.
  useEffect(() => {
    if (!engine || !gameKey) return;
    const persist = () => {
      saveGame(gameKey, engine.serialize({ elapsedMs: timer.elapsedMs, moves }));
    };
    persist();
    const id = window.setInterval(persist, 4000);
    const onHide = () => persist();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      persist();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, gameKey, moves, completed, engineVersion]);

  const shuffle = () => {
    if (!engine) return;
    engine.scatter(Math.floor(Math.random() * 100000));
    bumpVersion();
  };

  const autoArrange = () => {
    if (!engine) return;
    engine.autoArrange();
    bumpVersion();
  };

  const restart = () => {
    if (!engine || !gameKey) return;
    clearGame(gameKey);
    setMoves(0);
    setCompleted(false);
    timer.reset(0, true);
    setEngine(new PuzzleEngine(engine.config));
    bumpVersion();
  };

  const clearSave = () => {
    if (gameKey) clearGame(gameKey);
  };

  return {
    engine,
    engineVersion,
    moves,
    completed,
    timer,
    actions: { shuffle, autoArrange, restart, incrementMove, markComplete, clearSave },
  };
}
